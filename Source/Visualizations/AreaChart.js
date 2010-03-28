$jit.ST.Plot.NodeTypes.implement({
  'areachart-default' : {
    'render' : function(node, canvas) {
      var pos = node.pos.getc(true), 
          width = node.getData('width'),
          height = node.getData('height'),
          algnPos = this.getAlignedPos(pos, width, height),
          x = algnPos.x, y = algnPos.y,
          dimArray = node.getData('dimArray'),
          colorArray = node.getData('colorArray'),
          stringArray = node.getData('stringArray');

      var ctx = canvas.getCtx(), border = node.getData('border');
      if (colorArray && dimArray && stringArray) {
        for (var i=0, l=dimArray.length, acumLeft=0, acumRight=0; i<l; i++) {
          ctx.fillStyle = ctx.strokeStyle = colorArray[i];
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, y - acumLeft);
          ctx.lineTo(x + width, y - acumRight);
          ctx.lineTo(x + width, y - acumRight - dimArray[i][1]);
          ctx.lineTo(x, y - acumLeft - dimArray[i][0]);
          ctx.lineTo(x, y - acumLeft);
          ctx.fill();
          ctx.restore();
          if(border) {
            var strong = border.name == stringArray[i];
            var color = $.rgbToHex($.map($.hexToRgb(colorArray[i].slice(1)), 
                function(v) { return v * (strong? 0.7 : 0.8) >> 0; }));
            ctx.strokeStyle = color;
            ctx.lineWidth = strong? 4 : 1;
            ctx.save();
            ctx.beginPath();
            if(border.index === 0) {
              ctx.moveTo(x, y - acumLeft);
              ctx.lineTo(x, y - acumLeft - dimArray[i][0]);
            } else {
              ctx.moveTo(x + width, y - acumRight);
              ctx.lineTo(x + width, y - acumRight - dimArray[i][1]);
            }
            ctx.stroke();
            ctx.restore();
          }
          acumLeft += (dimArray[i][0] || 0);
          acumRight += (dimArray[i][1] || 0);
        }
      }
    },
    'contains': function(node, mpos) {
      var pos = node.pos.getc(true), 
          width = node.getData('width'),
          height = node.getData('height'),
          algnPos = this.getAlignedPos(pos, width, height),
          x = algnPos.x, y = algnPos.y,
          dimArray = node.getData('dimArray'),
          rx = mpos.x - x;
      //bounding box check
      if(mpos.x < x || mpos.x > x + width
        || mpos.y > y || mpos.y < y - height) {
        return false;
      }
      //deep check
      for(var i=0, l=dimArray.length, lAcum=y, rAcum=y; i<l; i++) {
        var dimi = dimArray[i];
        lAcum -= dimi[0];
        rAcum -= dimi[1];
        var intersec = lAcum + (rAcum - lAcum) * rx / width;
        if(mpos.y >= intersec) {
          var index = +(rx > width/2);
          return {
            'name': node.getData('stringArray')[i],
            'color': node.getData('colorArray')[i],
            'value': node.getData('valueArray')[i][index],
            'index': index
          };
        }
      }
      return false;
    }
  }
});

$jit.AreaChart = new Class({
  st: null,
  colors: ["#416D9C", "#70A35E", "#EBB056", "#C74243", "#83548B", "#909291", "#557EAA"],
  selected: {},
  
  initialize: function(opt) {
    this.controller = this.config = 
      $.merge(Options("Canvas", "AreaChart"), opt);
    this.initializeViz();
  },
  
  initializeViz: function() {
    var config = this.config, that = this;
    var st = new $jit.ST({
      injectInto: config.injectInto,
      orientation: "bottom",
      levelDistance: 0,
      siblingOffset: 0,
      subtreeOffset: 0,
      Node: {
        overridable: true,
        type: 'areachart-' + config.type,
        align: 'left'
      },
      Edge: {
        type: 'none'
      },
      Tips: {
        allow: config.Tips.enable,
        attachToDOM: false,
        attachToCanvas: true,
        force: true,
        onShow: function(tip, node, opt) {
          var elem = opt.contains;
          config.Tips.onShow(tip, elem, node);
          that.select(node.id, elem.name, elem.index);
        },
        onHide: function() {
          that.select(false, false, false);
        }
      },
      NodeStyles: {
        attachToDOM: false,
        attachToCanvas: true,
        onClick: function(node, opt, set) {
          if(!config.filterOnClick) return;
          var elem = opt.contains;
          that.filter(elem.name);
        },
        onRightClick: function(node, opt, set) {
          if(!config.restoreOnRightClick) return;
          that.restore();
        }
      }
    });
    
    var size = st.canvas.getSize();
    st.config.offsetY = -size.height/2 + config.offset;    
    this.st = st;
  },
  
  loadJSON: function(json) {
    var prefix = $.time(), 
        ch = [], 
        st = this.st,
        name = $.splat(json.label), 
        color = $.splat(json.color || this.colors),
        animate = this.config.animate;
    
    for(var i=0, values=json.values, l=values.length; i<l-1; i++) {
      var val = values[i], prev = values[i-1], next = values[i+1];
      var valLeft = values[i].values, valRight = values[i+1].values;
      var valArray = $.zip(valLeft, valRight);
      var acumLeft = 0, acumRight = 0;
      ch.push({
        'id': prefix + val.label,
        'name': val.label,
        'data': {
          'value': valArray,
          '$valueArray': valArray,
          '$colorArray': color,
          '$stringArray': name,
          '$next': next.label,
          '$prev': prev? prev.label:null
        },
        'children': []
      });
    }
    var root = {
      'id': prefix + '$root',
      'name': '',
      'data': {
        '$type': 'none',
        '$width': 1,
        '$height': 1
      },
      'children': ch
    };
    st.loadJSON(root);
    
    this.normalizeDims();
    st.compute();
    st.select(st.root);
    if(animate) {
      st.fx.animate({
        modes: ['node-property:height:dimArray'],
        duration:1500
      });
    }
  },
  
  updateJSON: function(json) {
    var st = this.st;
    var graph = st.graph;
    var values = json.values;
    var animate = this.config.animate;
    $.each(values, function(v) {
      var n = graph.getByName(v.label);
      if(n) {
        var valArray = n.getData('valueArray');
        $.each(valArray, function(a, i) {
          a[0] = v.values[i];
        });
        n.setData('valueArray', valArray);
        var prev = n.getData('prev');
        if(prev) {
          var p = graph.getByName(prev);
          var valArray = p.getData('valueArray');
          $.each(valArray, function(a, i) {
            a[1] = v.values[i];
          });
          p.setData('valueArray', valArray);
        }
      }
    });
    this.normalizeDims();
    st.compute();
    st.select(st.root);
    if(animate) {
      st.fx.animate({
        modes: ['node-property:height:dimArray'],
        duration:1500
      });
    }
  },
  
  filter: function() {
    var args = Array.prototype.slice.call(arguments);
    var rt = this.st.graph.getNode(this.st.root);
    $jit.Graph.Util.eachAdjacency(rt, function(adj) {
      var n = adj.nodeTo, 
          dimArray = n.getData('dimArray'),
          stringArray = n.getData('stringArray');
      n.setData('dimArray', $.map(dimArray, function(d, i) {
        return (args.indexOf(stringArray[i]) > -1)? d:[0, 0];
      }), 'end');
    });
    this.st.fx.animate({
      modes: ['node-property:dimArray'],
      duration:1500
    });
  },
  
  restore: function() {
    this.normalizeDims();
    this.st.fx.animate({
      modes: ['node-property:height:dimArray'],
      duration:1500
    });
  },
  //adds the little brown bar when hovering the node
  select: function(id, name, index) {
    var s = this.selected;
    if(s.id != id || s.name != name 
        || s.index != index) {
      s.id = id;
      s.name = name;
      s.index = index;
      $jit.Graph.Util.eachNode(this.st.graph, function(n) {
        n.setData('border', false);
      });
      if(id) {
        var n = this.st.graph.getNode(id);
        n.setData('border', s);
        var link = index === 0? 'prev':'next';
        link = n.getData(link);
        if(link) {
          n = this.st.graph.getByName(link);
          if(n) {
            n.setData('border', {
              name: name,
              index: 1-index
            });
          }
        }
      }
      this.st.plot();
    }
  },
  
  getLegend: function() {
    var legend = {};
    var n;
    $jit.Graph.Util.eachAdjacency(this.st.graph.getNode(this.st.root), function(adj) {
      n = adj.nodeTo;
    });
    $.each(n.getData('stringArray'), function(s, i) {
      legend[s] = n.getData('colorArray')[i];
    });
    return legend;
  },
  
  getMaxValue: function() {
    var maxValue = 0;
    $jit.Graph.Util.eachNode(this.st.graph, function(n) {
      var valArray = n.getData('valueArray'),
          acumLeft = 0, acumRight = 0;
      $.each(valArray, function(v) { 
        acumLeft += +v[0];
        acumRight += +v[1];
      });
      var acum = acumRight>acumLeft? acumRight:acumLeft;
      maxValue = maxValue>acum? maxValue:acum;
    });
    return maxValue;
  },
  
  normalizeDims: function() {
    //number of elements
    var root = this.st.graph.getNode(this.st.root), l=0;
    $jit.Graph.Util.eachAdjacency(root, function() {
      l++;
    });
    var maxValue = this.getMaxValue(),
        size = this.st.canvas.getSize(),
        config = this.config,
        offset = config.offset,
        fixedDim = (size.width - 2 * offset) / l,
        animate = config.animate,
        height = size.height - 2 * offset;
    $jit.Graph.Util.eachNode(this.st.graph, function(n) {
      var acumLeft = 0, acumRight = 0, animateValue = [];
      $.each(n.getData('valueArray'), function(v) {
        acumLeft += +v[0];
        acumRight += +v[1];
        animateValue.push([0, 0]);
      });
      var acum = acumRight>acumLeft? acumRight:acumLeft;
      n.setData('width', fixedDim);
      if(animate) {
        n.setData('height', 0);
        n.setData('height', acum * height / maxValue, 'end');
        n.setData('dimArray', $.map(n.getData('valueArray'), function(n) { 
          return [n[0] * height / maxValue, n[1] * height / maxValue]; 
        }), 'end');
        var dimArray = n.getData('dimArray');
        if(!dimArray) {
          n.setData('dimArray', animateValue);
        }
      } else {
        n.setData('height', acum * height / maxValue);
        n.setData('dimArray', $.map(n.getData('valueArray'), function(n) { 
          return [n[0] * height / maxValue, n[1] * height / maxValue]; 
        }));
      }
    });
  }
});