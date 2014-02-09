# gQuery

## Generic jQuery

gQuery provides a jQuery-esque API for querying ordinary JavaScript objects.

### Usage

```javascript
var gQuery = require('gquery');

var $ = gQuery([
  { id: 'foo', tag: 1 },
  { class: 'bar', tag: 2 },
  {
    class: 'baz',
    tag: 3,
    children: [
      { id: 'foo', tag: 4 }
    ]
  }
]);

$('#foo');        // => [{ id: 'foo', tag: 1 }, { id: 'foo', tag: 4 }]
$('.bar');        // => [{ class: 'bar', tag: 2 }]
$('.baz > #foo'); // => [{ id: 'foo', tag: 4 }]
```
