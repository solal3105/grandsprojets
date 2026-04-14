// Activate async-loaded CDN CSS (media="print" → "all")
['css-maplibre','css-fa-base','css-fa-solid'].forEach(function(id) {
  var l = document.getElementById(id);
  if (l) {
    if (l.sheet) { l.media = 'all'; }
    else { l.onload = function() { l.media = 'all'; }; }
  }
});
