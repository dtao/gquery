var Lazy = require('lazy.js');

/**
 * @typedef {object} LocatorPart
 * @property {string} type One of ['id', 'class', 'name']
 * @property {boolean} direct Whether this part represents a direct descendant
 * @property {string} value The id, class name, or name to look for
 */

/**
 * Wraps an object and provides jQuery-like query capabilities on that object.
 *
 * @example
 * var $ = gQuery([
 *   { 'id': 'foo', attr: 1 },
 *   { 'class': 'bar', attr: 2 },
 *   {
 *     'name': 'baz',
 *     'attr': 3,
 *     'children': [
 *       { 'class': 'bar', attr: 4 }
 *     ]
 *   }
 * ]);
 *
 * $('#foo');        // => [{ id: 'foo', attr: 1 }]
 * $('.bar');        // => [{ 'class': 'bar', attr: 2 }, { 'class': 'bar', attr: 4 }]
 * $('baz')[0].attr; // => 3
 * $('baz > .bar');  // => [{ 'class': 'bar', attr: 4 }]
 */
function gQuery(context, options) {
  var adapter = new Adapter(context, options || {});

  return function $(selector) {
    return adapter.find(selector);
  };
}

var Errors = {
  INVALID_SELECTOR: 'Invalid selector'
};

function Adapter(context, options) {
  this.context = context || [];

  options || (options = {});

  virtualMethod(this, options, 'getId');
  virtualMethod(this, options, 'getName');
  virtualMethod(this, options, 'getClass');
  virtualMethod(this, options, 'getChildren');
}

function virtualMethod(object, impl, name) {
  if (typeof impl[name] === 'function') {
    object[name] = impl[name];
  }
}

Adapter.prototype.getId = function getId(node) {
  return node.id;
};

Adapter.prototype.getClass = function getClass(node) {
  return node.class;
};

Adapter.prototype.getName = function getName(node) {
  return node.name;
};

Adapter.prototype.getChildren = function getChildren(node) {
  return node.children || [];
};

Adapter.prototype.find = function find(selector) {
  return new Locator(selector, this).find(this.context);
};

Adapter.prototype.findMatches = function findMatches(nodes, recursive, predicate) {
  var adapter = this,
      matches = [];

  if (!(nodes instanceof Array)) {
    nodes = adapter.getChildren(nodes);
  }

  Lazy(nodes).each(function(node) {
    if (predicate(node)) {
      matches.push(node);
    }

    if (recursive) {
      matches.push.apply(matches, adapter.findMatches(node, true, predicate));
    }
  });

  return matches;
};

function Locator(selector, adapter) {
  this.parts   = parseSelector(selector);
  this.adapter = adapter || new Adapter();
}

/**
 * @example
 * var fooLocator   = new gQuery.Locator('#foo'),
 *     childLocator = new gQuery.Locator('foo > bar');
 *
 * fooLocator.find([{ id: 'bar' }, { id: 'foo' }]);
 * // => [{ id: 'foo' }]
 *
 * fooLocator.find([
 *   { children: [] },
 *   { children: [{ id: 'bar' }] },
 *   {
 *     children: [
 *       { id: 'foo', attribute: 'blah' },
 *       { id: 'bar', attribute: 'whatever' }
 *     ]
 *   }
 * ]);
 * // => [{ id: 'foo', attribute: 'blah' }]
 *
 * childLocator.find([
 *   {
 *     name: 'foo',
 *     children: [
 *       { name: 'foo', x: 1 },
 *       { name: 'bar', x: 2 },
 *       {
 *         children: [
 *           { name: 'bar', x: 3 }
 *         ]
 *       }
 *     ]
 *   },
 *   {
 *     name: 'bar',
 *     children: [
 *       { name: 'foo', x: 4 }
 *     ]
 *   }
 * ]);
 * // => [{ name: 'bar', x: 2 }]
 */
Locator.prototype.find = function find(target) {
  var adapter = this.adapter;

  var result = target instanceof Array ? target : [target];

  var finalIndex = this.parts.length - 1;

  Lazy(this.parts).each(function(part, i) {
    switch (part.type) {
      case 'id':
        result = adapter.findMatches(result, !part.direct, function(child) {
          return adapter.getId(child) === part.value;
        });
        break;

      case 'class':
        result = adapter.findMatches(result, !part.direct, function(child) {
          return adapter.getClass(child) === part.value;
        });
        break;

      case 'name':
        result = adapter.findMatches(result, !part.direct, function(child) {
          return adapter.getName(child) === part.value;
        });
        break;
    }

    if (i != finalIndex) {
      result = Lazy(result)
        .map(function(match) {
          return adapter.getChildren(match);
        })
        .flatten()
        .toArray();
    }
  });

  return result;
};

/**
 * @private
 * @returns {Array.<LocatorPart>}
 *
 * @example
 * parseSelector('foo > bar');
 * // => [
 *   { type: 'name', direct: false, value: 'foo' },
 *   { type: 'name', direct: true, value: 'bar' }
 * ]
 *
 * parseSelector('foo > > bar'); // throws
 *
 * parseSelector('#foo .bar baz');
 * // => [
 *   { type: 'id', direct: false , value: 'foo' },
 *   { type: 'class', direct: false, value: 'bar' },
 *   { type: 'name', direct: false, value: 'baz' }
 * ]
 */
function parseSelector(selector) {
  var matcher = /[#\.]?(?:[\w\d\-]+|>)/g,
      match,
      value,
      parts = [],
      type,
      direct = false;

  while (match = matcher.exec(selector)) {
    value = match[0];

    if (value === '>') {
      if (direct) {
        throw 'Encountered redundant "direct descendant" (>) selector at ' +
          match.index;
      }

      direct = true;
      continue;
    }

    switch (value.charAt(0)) {
      case '#':
        type = 'id';
        value = value.substring(1);
        break;

      case '.':
        type = 'class';
        value = value.substring(1);
        break;

      default:
        type = 'name';
        break;
    }

    parts.push({
      type: type,
      direct: direct,
      value: value
    });

    direct = false;
  }

  return parts;
}

gQuery.Adapter = Adapter;
gQuery.Locator = Locator;

module.exports = gQuery;
