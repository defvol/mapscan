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

function processTile(tile, featureIndex, satMap, callback) {
    var zxy = [ tile[2], tile[0], tile[1] ].join('/');
    console.log('running prediction for', zxy);

    request(`http://localhost:3000?tile=${zxy}`, function(err, res, body) {
          if (!err && res.statusCode === 200) {
            var classRegex = /(\w+way) .+: (\d+\.\d+)/;
            var predictions = body.split('\n')
              .map(line => line.match(classRegex))
              .filter(match => match !== null)
              .reduce((accu, match) => {
                  accu[match[1]] = parseFloat(match[2]);
                  return accu;
              }, {});

            console.log(zxy, ' = ', JSON.stringify(predictions));

            if(predictions.highway >= 0.8) {
                console.log('80% there is a highway in', zxy);
                subgrid.features[featureIndex].properties.highway = true;
            } else {
                subgrid.features[featureIndex].properties.processed = true;
            }

            satMap.getSource('subgrid').setData(subgrid);
          }

          callback();
    });
}

window.onload = function() {
  var satMap = new mapboxgl.Map({
      container: 'before',
      style: 'mapbox://styles/rodowi/cizsnh775002y2ro75hhyrzmd',
      hash: true,
      center: [-116.4988, 31.8893],
      zoom: 11
  });

  var osMap = new mapboxgl.Map({
      container: 'after',
      style: 'mapbox://styles/mapbox/streets-v9',
      center: [-116.4988, 31.8893],
      zoom: 11
  });

  satMap.on('load', function() {
      var busy = false;

      satMap.addSource('subgrid', {
          type: 'geojson',
          data: subgrid
      });

      satMap.addLayer({
          'id': 'subtiles',
          'type': 'fill',
          'source': 'subgrid',
          'paint': {
              'fill-color': 'hsla(0,0,1,0)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          }
      });

      satMap.addLayer({
          'id': 'subtiles-highlighted',
          'type': 'fill',
          'source': 'subgrid',
          'paint': {
              'fill-color': 'hsla(293,1.0,0.5,0.25)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          },
          'filter': ['has', 'processed']
      });

      satMap.addLayer({
          'id': 'subtiles-with-highway',
          'type': 'fill',
          'source': 'subgrid',
          'paint': {
              'fill-color': 'rgba(97,175,239,0.25)',
              'fill-outline-color': 'rgba(97,175,239,0.5)'
          },
          'filter': ['has', 'highway']
      });

      satMap.on('click', function(e) {
          if (busy) {
              console.log('we are busy processing tiles, try again later');
              return;
          }

          busy = true;

          var zoom = 12
          var tile = tilebelt.pointToTile(e.lngLat.lng, e.lngLat.lat, zoom)
          var queue = q.queue(4)

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
              queue.defer(processTile, z16[i], i, satMap);
          }
          satMap.getSource('subgrid').setData(subgrid);

          queue.awaitAll(function (err, results) {
              busy = false;
              if (err) console.log(err);
              else console.log('finished %d z16 tiles', results.length);
          });
      });
  });

  var map = new mapboxgl.Compare(satMap, osMap, {});
};
