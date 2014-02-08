/**
 * @typedef {object} LocatorPart
 * @property {string} type One of ['id', 'class', 'name']
 * @property {boolean} direct Whether this part represents a direct descendant
 * @property {string} value The id, class name, or name to look for
 */

function gQuery(context, options) {
  options || (options = {});

  context = new Context(context);

  virtualMethod(context, options, 'getId');
  virtualMethod(context, options, 'getName');
  virtualMethod(context, options, 'getClass');
  virtualMethod(context, options, 'getChildren');

  return wrapContext(context);
}

function virtualMethod(object, impl, name) {
  if (typeof impl[name] === 'function') {
    object[name] = impl[name];
  }
}

function wrapContext(context) {
  return function $(selector) {
    return context.find(selector);
  };
}

var Errors = {
  INVALID_SELECTOR: 'Invalid selector'
};

function Context(context) {
  this.context = context || [];
}

Context.prototype.getId = function getId(node) {
  return node.id;
};

Context.prototype.getClass = function getClass(node) {
  return node.class;
};

Context.prototype.getName = function getName(node) {
  return node.name;
};

Context.prototype.getChildren = function getChildren(node) {
  return node.children || [];
};

Context.prototype.find = function find(selector, node) {
  if (selector instanceof gQuery.Node) {
    return selector;
  }

  return new Locator(selector, this).find(node);
};

Context.prototype.findMatches = function findMatches(nodes, recursive, predicate) {
  var context = this,
      matches = [];

  if (!(nodes instanceof Array)) {
    nodes = context.getChildren(nodes);
  }

  nodes.forEach(function(node) {
    if (predicate(node)) {
      matches.push(node);
    }

    if (recursive) {
      matches.push.apply(matches, context.findMatches(node, true, predicate));
    }
  });

  return matches;
};

function Locator(selector, context) {
  this.parts   = parseSelector(selector);
  this.context = context || new Context();
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
  var context = this.context;

  var result = target instanceof Array ? target : [target];

  var finalIndex = this.parts.length - 1;

  this.parts.forEach(function(part, i) {
    var matches;

    switch (part.type) {
      case 'id':
        matches = context.findMatches(result, !part.direct, function(child) {
          return context.getId(child) === part.value;
        });
        break;

      case 'class':
        matches = context.findMatches(result, !part.direct, function(child) {
          return context.getClass(child) === part.value;
        });
        break;

      case 'name':
        matches = context.findMatches(result, !part.direct, function(child) {
          return context.getName(child) === part.value;
        });
        break;
    }

    if (i != finalIndex) {
      result = [];
      matches.forEach(function(match) {
        result.push.apply(result, context.getChildren(match));
      });
    } else {
      result = matches;
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

gQuery.Context = Context;
gQuery.Locator = Locator;

module.exports = gQuery;
