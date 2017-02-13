var tilebelt = require('@mapbox/tilebelt');

mapboxgl.accessToken = 'pk.eyJ1Ijoicm9kb3dpIiwiYSI6ImdZdDkyQU0ifQ.bPu86kwHgaenPhYp84g1yg';

/**
 * Get tiles at higher zoom levels
 * @param {Array} tile [x, y, z]
 * @param {Number} depth
 * @return {Array} children
 */
function getChildren(tile, depth) {
    var __flatten = (p, c) => p.concat(c);
    var cc = [tile];

    for (var i = 0; i < depth; i++) {
        cc = cc.map(tilebelt.getChildren).reduce(__flatten, []);
    }

    return cc;
}

window.onload = function() {
  var satMap = new mapboxgl.Map({
      container: 'before',
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [0, 0],
      zoom: 0
  });

  var osMap = new mapboxgl.Map({
      container: 'after',
      style: 'mapbox://styles/rodowi/ciz26g64u002g2spru77a8mk0',
      center: [0, 0],
      zoom: 0
  });

  osMap.on('load', function() {
      osMap.addSource('grid', {
          'type': 'vector',
          'url': 'mapbox://rodowi.3hb2t4ac'
      });

      osMap.addLayer({
          'id': 'tiles',
          'type': 'fill',
          'source': 'grid',
          'source-layer': 'tiles',
          'paint': {
              'fill-color': 'hsla(0,0,1,0)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          }
      });

      osMap.addLayer({
          'id': 'tiles-highlighted',
          'type': 'fill',
          'source': 'grid',
          'source-layer': 'tiles',
          'paint': {
              'fill-color': 'hsla(293,1.0,0.5,0.5)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          },
          'filter': ['in', 'title', '']
      });

      osMap.on('click', function(e) {
          var filter = ['in', 'title'];
          var layers = ['tiles'];
          var features = osMap.queryRenderedFeatures(e.point, { layers: layers });
          for (var i = 0; i < features.length; i++) {
              var title = features[i].properties.title;
              filter.push(title);
              var tile = title
                  .match(/(\d+, \d+, \d+)/)[0]
                  .split(', ')
                  .map(s => parseInt(s));
              console.log('clicking tile', tile);
              var z13 = getChildren(tile, 1).map(t => t.join('/'));
              console.log('z13 children are', z13);
          }

          osMap.setFilter('tiles-highlighted', filter);
      });
  });

  var map = new mapboxgl.Compare(satMap, osMap, {
      // Set this to enable comparing two maps by mouse movement:
      // mousemove: true
  });
};
