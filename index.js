var q = require('d3-queue');
var request = require('request');
var tilebelt = require('@mapbox/tilebelt');

var subgrid = {
    type: 'FeatureCollection',
    features: []
};

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

function processTile(tile, featureIndex, osMap, callback) {
    var zxy = [ tile[2], tile[0], tile[1] ].join('/');
    console.log('running prediction for', zxy);

    request(`http://localhost:3000?tile=${zxy}`, function(err, res, body) {
          if (!err && res.statusCode === 200) {
            var classRegex = /(\w+way) .+: (\d+\.\d+)/;
            var predictions = body.split('\n')
              .map(line => line.match(classRegex))
              .filter(match => match !== null)
              .map(match => {
                  var o = {};
                  o[match[1]] = parseFloat(match[2]);
                  return o;
              });
            console.log(zxy, ' = ', JSON.stringify(predictions));
            subgrid.features[featureIndex].properties.processed = true;
            osMap.getSource('subgrid').setData(subgrid);
          }

          callback();
    });
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
      var busy = false;

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

      osMap.addSource('subgrid', {
          type: 'geojson',
          data: subgrid
      });

      osMap.addLayer({
          'id': 'subtiles',
          'type': 'fill',
          'source': 'subgrid',
          'paint': {
              'fill-color': 'hsla(0,0,1,0)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          }
      });

      osMap.addLayer({
          'id': 'subtiles-highlighted',
          'type': 'fill',
          'source': 'subgrid',
          'paint': {
              'fill-color': 'hsla(293,1.0,0.5,0.25)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          },
          'filter': ['has', 'processed']
      });

      osMap.on('click', function(e) {
          if (busy) {
              console.log('we are busy processing tiles, try again later');
              return;
          }

          busy = true;
          var queue = q.queue(1)
          var layers = ['tiles'];
          var features = osMap.queryRenderedFeatures(e.point, { layers: layers });
          for (var i = 0; i < features.length; i++) {
              var title = features[i].properties.title;
              var tile = title
                  .match(/(\d+, \d+, \d+)/)[0]
                  .split(', ')
                  .map(s => parseInt(s));
              console.log('clicking tile', tile);

              var z16 = getChildren(tile, 4);
              subgrid.features = [];
              for (var i = 0; i < z16.length; i++) {
                  var f = {
                      type: 'Feature',
                      properties: {},
                      geometry: tilebelt.tileToGeoJSON(z16[i])
                  };
                  subgrid.features.push(f);
                  queue.defer(processTile, z16[i], i, osMap);
              }
              osMap.getSource('subgrid').setData(subgrid);
          }

          queue.awaitAll(function (err, results) {
              busy = false;
              if (err) console.log(err);
              else console.log('finished %d z16 tiles', results.length);
          });
      });
  });

  var map = new mapboxgl.Compare(satMap, osMap, {});
};
