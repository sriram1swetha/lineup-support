/* Two of the owner's real games, embedded so the round-trip RENDERER can be
 * validated independently of detection: render these known-good templates and
 * confirm the shape + dot numbering look right (i.e. the unit-space convention
 * and the line/bézier rendering match the app).
 */
window.SAMPLES = {
  "Rangoli (all lines)": {
    "name": "Basic Rangoli", "gameMode": "easy", "imageOpacity": 0.5,
    "dotDiameter": 12.0, "strokeThickness": 6.0, "freeUndos": 5,
    "unitDots": [[-0.913,0.0],[0.0,-0.916],[0.938,0.0],[0.0,0.919],[-0.455,0.46],[0.461,0.467],[0.464,-0.459],[-0.46,-0.455],[-0.625,0.0],[0.0,-0.625],[0.642,0.0],[0.0,0.625],[-0.625,0.0],[-0.25,0.0],[0.0,0.267],[0.25,0.0],[0.0,-0.25],[-0.25,0.0],[0.0,-0.625],[0.0,-0.25],[0.25,0.0],[0.642,0.0],[0.0,0.267],[0.0,0.625]],
    "bezierSegments": [
      {"from":0,"to":1,"type":"line"},{"from":1,"to":2,"type":"line"},{"from":2,"to":3,"type":"line"},{"from":3,"to":0,"type":"line"},
      {"from":4,"to":5,"type":"line"},{"from":5,"to":6,"type":"line"},{"from":6,"to":7,"type":"line"},{"from":7,"to":4,"type":"line"},
      {"from":8,"to":9,"type":"line"},{"from":9,"to":10,"type":"line"},{"from":10,"to":11,"type":"line"},{"from":11,"to":8,"type":"line"},
      {"from":12,"to":13,"type":"line"},{"from":13,"to":14,"type":"line"},{"from":14,"to":15,"type":"line"},{"from":15,"to":16,"type":"line"},{"from":16,"to":17,"type":"line"},
      {"from":18,"to":19,"type":"line"},{"from":20,"to":21,"type":"line"},{"from":22,"to":23,"type":"line"}
    ]
  },
  "Soccer (multi-path)": {
    "name": "Soccer", "gameMode": "surprise", "imageOpacity": 0.2,
    "dotDiameter": 12.0, "strokeThickness": 4.0, "freeUndos": 2,
    "unitDots": [[-0.039,-0.836],[0.564,-0.586],[0.814,0.018],[0.564,0.621],[-0.039,0.871],[-0.642,0.621],[-0.892,0.018],[-0.642,-0.586],[0.099,-0.785],[0.266,-0.625],[0.594,-0.477],[0.719,-0.101],[0.563,0.147],[0.563,0.5],[0.25,0.727],[-0.079,0.669],[-0.375,0.75],[-0.704,0.5],[-0.75,0.188],[-0.875,-0.02],[-0.75,-0.438],[-0.527,-0.563],[-0.313,-0.774],[-0.355,-0.337],[0.031,-0.375],[0.188,0.043],[-0.125,0.313],[-0.5,0.09],[0.5,0.125],[0.25,0.063],[0.25,-0.598],[0.081,-0.407],[-0.5,-0.52],[-0.391,-0.375],[-0.688,0.168],[-0.544,0.094],[-0.103,0.625],[-0.125,0.375]],
    "bezierSegments": [
      {"from":0,"to":1,"type":"bezier","control1":{"x":0.195,"y":-0.832},"control2":{"x":0.396,"y":-0.749}},
      {"from":1,"to":2,"type":"bezier","control1":{"x":0.728,"y":-0.418},"control2":{"x":0.811,"y":-0.217}},
      {"from":2,"to":3,"type":"bezier","control1":{"x":0.811,"y":0.252},"control2":{"x":0.728,"y":0.453}},
      {"from":3,"to":4,"type":"bezier","control1":{"x":0.396,"y":0.784},"control2":{"x":0.195,"y":0.867}},
      {"from":4,"to":5,"type":"bezier","control1":{"x":-0.273,"y":0.867},"control2":{"x":-0.474,"y":0.784}},
      {"from":5,"to":6,"type":"bezier","control1":{"x":-0.805,"y":0.453},"control2":{"x":-0.889,"y":0.252}},
      {"from":6,"to":7,"type":"bezier","control1":{"x":-0.889,"y":-0.217},"control2":{"x":-0.805,"y":-0.418}},
      {"from":7,"to":0,"type":"bezier","control1":{"x":-0.474,"y":-0.749},"control2":{"x":-0.273,"y":-0.832}},
      {"from":8,"to":9,"type":"line"},{"from":9,"to":10,"type":"line"},
      {"from":11,"to":12,"type":"line"},{"from":12,"to":13,"type":"line"},
      {"from":14,"to":15,"type":"line"},{"from":15,"to":16,"type":"line"},
      {"from":17,"to":18,"type":"line"},{"from":18,"to":19,"type":"line"},
      {"from":20,"to":21,"type":"line"},{"from":21,"to":22,"type":"line"},
      {"from":23,"to":24,"type":"bezier","control1":{"x":-0.224,"y":-0.38},"control2":{"x":-0.095,"y":-0.393}},
      {"from":24,"to":25,"type":"bezier","control1":{"x":0.121,"y":-0.312},"control2":{"x":0.213,"y":-0.072}},
      {"from":25,"to":26,"type":"bezier","control1":{"x":0.134,"y":0.139},"control2":{"x":0.03,"y":0.229}},
      {"from":26,"to":27,"type":"bezier","control1":{"x":-0.279,"y":0.263},"control2":{"x":-0.404,"y":0.189}},
      {"from":27,"to":23,"type":"bezier","control1":{"x":-0.538,"y":-0.018},"control2":{"x":-0.443,"y":-0.259}},
      {"from":28,"to":29,"type":"line"},{"from":30,"to":31,"type":"line"},{"from":32,"to":33,"type":"line"},{"from":34,"to":35,"type":"line"},{"from":36,"to":37,"type":"line"}
    ]
  }
};
