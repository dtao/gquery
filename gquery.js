(function() {

  var Lazy = this.Lazy;

  if (!Lazy) {
    if (typeof require === 'function') {
      Lazy = require('lazy.js');
    }

    if (!Lazy) {
      throw 'gQuery requires lazy.js!';
    }
  }

  /**
   * @typedef {object} LocatorPartOptions
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
   * $('#foo');             // => collection: [{ id: 'foo', attr: 1 }]
   * $('.bar');             // => collection: [{ 'class': 'bar', attr: 2 }, { 'class': 'bar', attr: 4 }]
   * $('baz').prop('attr'); // => 3
   * $('baz > .bar');       // => collection: [{ 'class': 'bar', attr: 4 }]
   * $('.bar[attr="4"]');   // => collection: [{ 'class': 'bar', attr: 4 }]
   */
  function gQuery(context, options) {
    var adapter = new Adapter(options),
        root    = wrapContext(context, adapter);

    return function $(selector) {
      return root.find(selector);
    };
  }

  function wrapContext(context, adapter) {
    var object = context instanceof Array ? {} : context,
        node   = new Node(object, adapter);

    if (context instanceof Array) {
      node.children = new Collection(context, adapter, node);
    }

    return node;
  }

  /**
   * A collection of objects wrapped by gQuery.
   *
   * A `Collection` belongs to a parent node, as opposed to a
   * {@link gQuery.Selection}, which is the result of a query and may consist of
   * nodes from many parents.
   *
   * @param {Array.<*>} source The array of objects to include in the collection.
   * @param {Adapter} adapter The adapter to use for {@link #find}, etc.
   * @param {Node} parent The parent {@link gQuery.Node} this collection
   *     belongs to.
   * @constructor
   */
  function Collection(source, adapter, parent) {
    this.adapter = adapter || new Adapter();
    this.parent  = parent;
    this.nodes   = this.createNodes(source || []);
  }

  Collection.prototype = Object.create(Lazy.ArrayLikeSequence.prototype);

  Collection.prototype.get = function get(i) {
    return this.nodes[i];
  };

  Collection.prototype.length = function length() {
    return this.nodes.length;
  };

  Collection.prototype.add = function add(node) {
    // Update source object
    this.adapter.appendChild(this.parent.object, node.object);

    // Update wrapper nodes
    this.nodes.push(node);
    node.parent = this.parent;
    node.index = this.nodes.length - 1;

    return this;
  };

  Collection.prototype.removeAt = function removeAt(index) {
    // Update source object
    this.adapter.removeChild(this.parent.object, index);

    // Update wrapper nodes
    var node = this.nodes[index];
    this.nodes.splice(index, 1);
    this.slice(index).each(function(node) {
      --node.index;
    });
    node.index = -1;

    return this;
  };

  Collection.prototype.createNodes = function createNodes(source) {
    var collection = this,
        adapter = this.adapter,
        parent = this.parent;

    return Lazy(source)
      .map(function(object, index) {
        if (object instanceof Node) {
          throw 'A Collection should not wrap existing nodes!';
        }

        return new Node(object, adapter, parent, index);
      })
      .toArray();
  };

  Collection.prototype.inspect = function inspect() {
    return JSON.stringify(this.value(), function(key, value) {
      if (key === 'parent' || key === 'adapter') {
        return undefined;
      }

      if (value instanceof Node) {
        return value.unwrap();
      }

      return value;
    }, 2);
  };

  /**
   * Removes all nodes in this collection from their parents.
   *
   * @returns {Collection}
   *
   * @example
   * var array = [{ name: 'root', children: [1, 2, 3] }];
   *
   * var $ = gQuery(array, {
   *   id: function(x) { return x; }
   * });
   *
   * $('#2').remove();
   * array[0].children;    // => [1, 3]
   * $('root').children(); // => collection: [1, 3]
   */
  Collection.prototype.remove = function remove() {
    this.each(function(node) {
      node.remove();
    });

    return this;
  };

  /**
   * Appends all nodes in this collection to the specified parent.
   *
   * @returns {Collection}
   *
   * @example
   * var array = [
   *   { name: 'foo', children: [1, 2, 3] },
   *   { name: 'bar', children: [4, 5, 6] }
   * ];
   *
   * var $ = gQuery(array, {
   *   id: function(x) { return x; }
   * });
   *
   * $('#5').appendTo($('foo'));
   * array[0].children;    // => [1, 2, 3, 5]
   * array[1].children;    // => [4, 6]
   * $('foo').children();  // => collection: [1, 2, 3, 5]
   * $('bar').children();  // => collection: [4, 6]
   * $('#5').get(0).index; // => 3
   */
  Collection.prototype.appendTo = function appendTo(parent) {
    // TODO: What should actually happen here?
    var parentNode = parent.first();

    this.each(function(node) {
      node.appendTo(parentNode);
    });

    return this;
  };

  /**
   * Gets all the children of all the nodes in the collection.
   */
  Collection.prototype.children = function children() {
    return this.map('children').flatten();
  };

  /**
   * Either gets or sets the property with the specified name.
   *
   * To *get* the property, only supply the first parameter ('name'). The return
   * value will be retrieved from the first element in the collection.
   *
   * To *set* the property, supply both parameters ('name' and 'value'). The
   * property will be set for every element in the collection.
   *
   * @param {string} name The name of the property to get/set.
   * @param {*} value The value for the property.
   * @returns {Collection} The collection.
   *
   * @example
   * var collection = new gQuery.Collection([
   *   { tag: 1 },
   *   { tag: 2 }
   * ]);
   *
   * collection.prop('tag');    // => 1
   * collection.prop('tag', 3); // => collection: [{ tag: 3 }, { tag: 3 }]
   */
  Collection.prototype.prop = function prop(name, value) {
    if (arguments.length === 1) {
      var first = this.first();
      if (first) { return first.get(name); }
      return undefined;
    }

    this.each(function(e) {
      e.set(name, value);
    });

    return this;
  };

  /**
   * Finds all the matches for the given selector.
   *
   * @param {string} selector A selector like '#foo', '.bar', etc.
   * @returns {Collection} A collection consisting of all the matches.
   *
   * @example
   * var collection = new gQuery.Collection([
   *   {
   *     id: 'foo',
   *     children: [
   *       { 'class': 'bar', tag: 2 }
   *     ],
   *     tag: 1
   *   },
   *   { 'class': 'bar', tag: 3 }
   * ]);
   *
   * collection.find('#foo').prop('tag');  // => 1
   * collection.find('#foo').find('.bar'); // => collection: [{ 'class': 'bar', tag: 2 }]
   */
  Collection.prototype.find = function find(selector) {
    return new Locator(selector, this.adapter).find(this);
  };

  /**
   * A selection of nodes (the result of a query). Basically like a
   * {@link gQuery.Collection} except that the nodes may come from many parents.
   *
   * @param {Array.<Node>} nodes
   * @param {Adapter} adapter
   */
  function Selection(nodes, adapter) {
    this.nodes = nodes;
    this.adapter = adapter;
  }

  // TODO: should Selection really inherit from Collection? Right now I'm really
  // just doing this for code-sharing convenience. It might be a poor design
  // decision.
  Selection.prototype = Object.create(Collection.prototype);

  /**
   * A single object wrapped by gQuery. This guy has a reference to his parent,
   * which will be necessary for `appendTo`, `insertBefore`, etc.
   *
   * @param {*} object The object to wrap.
   * @param {Adapter} adapter Always need the freakin' adapter.
   * @param {?Node} parent The parent node (can be `null`).
   * @constructor
   */
  function Node(object, adapter, parent, index) {
    if (!(this instanceof Node)) {
      return new Node(object, adapter, parent, index);
    }

    this.object   = object;
    this.adapter  = adapter;
    this.parent   = parent;
    this.index    = index;
    this.children = this.createChildren();
  }

  Object.defineProperty(Node.prototype, 'id', {
    get: function id() {
      return this.adapter.getId(this.object);
    }
  });

  Object.defineProperty(Node.prototype, 'name', {
    get: function name() {
      return this.adapter.getName(this.object);
    }
  });

  Object.defineProperty(Node.prototype, 'className', {
    get: function className() {
      return this.adapter.getClass(this.object);
    }
  });

  Node.prototype.find = function find(selector) {
    return this.children.find(selector);
  };

  Node.prototype.get = function get(property) {
    return (this.object && this.object[property]) || undefined;
  };

  Node.prototype.set = function set(property, value) {
    var object = this.object;

    if (!object) {
      throw 'Cannot set a property of ' + object + '!';
    }

    var type = typeof object;
    if (type !== 'object' && type !== 'function') {
      throw 'Cannot set a property of a ' + type + '!';
    }

    object[property] = value;
    return this;
  };

  Node.prototype.createChildren = function createChildren() {
    var self = this,
        adapter = this.adapter;

    return new Collection(adapter.getChildren(this.object), adapter, this);
  };

  /**
   * Removes this node from its parent.
   */
  Node.prototype.remove = function remove() {
    if (this.parent) {
      this.parent.children.removeAt(this.index);
    }
  };

  /**
   * Appends the specified child node to this node's children.
   */
  Node.prototype.append = function append(child) {
    child.remove();
    this.children.add(child);
  };

  /**
   * Moves this node to the end of the specified parent node's children.
   */
  Node.prototype.appendTo = function(parent) {
    parent.append(this);
  };

  Node.prototype.unwrap = function unwrap() {
    return this.object;
  };

  /**
   * The `Adapter` object is responsible for configuring how gQuery traverses a
   * data structure. In particular it provides these overridable methods:
   *
   * - `getId` (for `'#foo'`-style selectors)
   * - `getName` (for `'foo'`-style selectors)
   * - `getClass` (for `'.foo'`-style selectors)
   * - `getChildren` (to understand how to search the entire structure)
   *
   * @param {Object} options Optional overrides for the methods listed above.
   * @constructor
   */
  function Adapter(options) {
    options || (options = {});

    // TODO: Replace these one day w/ some sort of custom 'selectors' array
    // to allow users to define their own selectors like '!foo' and '~bar' and
    // whatnot.
    overrideMethod(this, 'getId', options.id);
    overrideMethod(this, 'getName', options.name);
    overrideMethod(this, 'getClass', options.class);
    overrideMethod(this, 'getChildren', options.children);

    // Allow these to be overridden in case some special type of collection
    // is used?
    overrideMethod(this, 'appendChild', options.appendChild);
  }

  /**
   * @private
   * @param {Object} object
   * @param {string} name
   * @param {function(*):*|string} override
   *
   * @example
   * var base = { foo: 'bar' };
   *
   * overrideMethod(base, 'foo', function(x) { return -x; })
   *   .foo(5);
   * // => -5
   *
   * overrideMethod(base, 'foo', 'baz')
   *   .foo({ baz: 'blah' });
   * // => 'blah'
   */
  function overrideMethod(object, name, override) {
    if (typeof override === 'function') {
      object[name] = override;

    } else if (typeof override === 'string') {
      object[name] = function(node) {
        return node[override];
      };
    }

    return object;
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

  Adapter.prototype.appendChild = function appendChild(node, child) {
    this.getChildren(node).push(child);
  };

  Adapter.prototype.removeChild = function removeChild(node, childIndex) {
    this.getChildren(node).splice(childIndex, 1);
  };

  Adapter.prototype.findMatches = function findMatches(nodes, recursive, predicate, matches) {
    matches || (matches = []);

    var adapter = this;

    Lazy(nodes).each(function(node) {
      if (predicate(node)) {
        matches.push(node);
      }

      if (recursive) {
        adapter.findMatches(node.children, true, predicate, matches);
      }
    });

    return matches;
  };

  /**
   * The `Locator` object takes a selector and is responsible for applying that
   * selector in order to search a data structure.
   *
   * @param {string} selector A selector like '#foo', '.bar', etc.
   * @param {Adapter} adapter The adapter to use when searching.
   * @constructor
   */
  function Locator(selector, adapter) {
    this.adapter = adapter || new Adapter();

    this.parts = Lazy(parseSelector(selector || ''))
      .map(function(part) {
        return new LocatorPart(adapter, part);
      })
      .toArray();
  }

  /**
   * @example
   * var fooLocator   = new gQuery.Locator('#foo'),
   *     childLocator = new gQuery.Locator('foo > bar');
   *
   * fooLocator.find([{ id: 'bar' }, { id: 'foo' }]);
   * // => collection: [{ id: 'foo' }]
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
   * // => collection: [{ id: 'foo', attribute: 'blah' }]
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
   * // => collection: [{ name: 'bar', x: 2 }]
   */
  Locator.prototype.find = function find(target) {
    var adapter    = this.adapter,
        result     = getCollection(target, adapter),
        finalIndex = this.parts.length - 1;

    Lazy(this.parts).each(function(part, i) {
      result = adapter.findMatches(result, !part.direct, function(child) {
        return part.matches(child);
      });

      if (i != finalIndex) {
        result = Lazy(result)
          .map(function(match) {
            return match.children;
          })
          .flatten()
          .toArray();
      }
    });

    return new Selection(result, adapter);
  };

  /**
   * One part of a {@link Locator}.
   *
   * @param {Adapter} adapter
   * @param {LocatorPartOptions} options
   * @constructor
   */
  function LocatorPart(adapter, options) {
    options || (options = {});

    this.adapter   = adapter;
    this.source    = options.source;
    this.type      = options.type || 'name';
    this.direct    = options.direct || false;
    this.value     = options.value || '';
    this.condition = options.condition;
    this.matches   = this.getPredicate();
  }

  LocatorPart.prototype.getPredicate = function getPredicate() {
    var basePredicate = this.getBasePredicate(),
        predicate     = basePredicate,
        condition     = this.condition;

    if (condition) {
      predicate = this.applyCondition(condition, predicate);
    }

    return predicate;
  };

  LocatorPart.prototype.getBasePredicate = function getBasePredicate() {
    var adapter = this.adapter,
        type    = this.type,
        value   = this.value;

    switch (type) {
      case 'id':
        return function(node) {
          return String(node.id) === value;
        };

      case 'class':
        return function(node) {
          return String(node.className) === value;
        };

      case 'name':
        return function(node) {
          return String(node.name) === value;
        };
    }
  };

  LocatorPart.prototype.applyCondition = function applyCondition(condition, predicate) {
    switch (condition.type) {
      case 'equality':
        return function(node) {
          if (!predicate(node)) { return false; }

          // TODO: allow for non-string (e.g. numeric) matching as well
          return String(node.get(condition.property)) === String(condition.value);
        };

      default:
        throw 'Unknown condition type: "' + condition.type + '"! ' +
          '(from selector: ' + this.source + ')';
    }
  };

  /**
   * @private
   * @param {string} selector
   * @returns {Array.<LocatorPart>}
   *
   * @example
   * parseSelector('foo > bar');
   * // => [
   *   { source: 'foo', type: 'name', direct: false, value: 'foo' },
   *   { source: 'bar', type: 'name', direct: true, value: 'bar' }
   * ]
   *
   * parseSelector('foo > > bar'); // throws
   *
   * parseSelector('#foo .bar baz');
   * // => [
   *   { source: '#foo', type: 'id', direct: false , value: 'foo' },
   *   { source: '.bar', type: 'class', direct: false, value: 'bar' },
   *   { source: 'baz', type: 'name', direct: false, value: 'baz' }
   * ]
   *
   * parseSelector('#foo[bar="baz"]');
   * // => [
   *   {
   *     source: '#foo[bar="baz"]',
   *     type: 'id',
   *     direct: false,
   *     value: 'foo',
   *     condition: {
   *       type: 'equality',
   *       property: 'bar',
   *       value: 'baz'
   *     }
   *   }
   * ]
   */
  function parseSelector(selector) {
    var matcher = /[#\.]?(?:[\w\d\-]+(?:\[[\w\d]+[=]".*"\])?|>)/g,
        match,
        value,
        parts = [],
        part,
        type,
        direct = false,
        conditionMatch;

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

      partOptions = {
        source: match[0],
        type: type,
        direct: direct,
        value: value
      };

      conditionMatch = value.match(/\[([\w\d]+)[=]"(.*)"\]/);
      if (conditionMatch) {
        partOptions.value = partOptions.value
          .substring(0, conditionMatch.index);

        partOptions.condition = {
          type: 'equality',
          property: conditionMatch[1],
          value: conditionMatch[2]
        };
      }

      parts.push(partOptions);

      direct = false;
    }

    return parts;
  }

  function getCollection(source, adapter) {
    if (source instanceof Collection) {
      return source;
    }

    if (!(source instanceof Array)) {
      source = [source];
    }

    return new Selection(source, adapter);
  }

  gQuery.Adapter    = Adapter;
  gQuery.Collection = Collection;
  gQuery.Selection  = Selection;
  gQuery.Node       = Node;
  gQuery.Locator    = Locator;

  if (typeof module === 'object' && module && module.exports) {
    module.exports = gQuery;
  } else {
    this.gQuery = gQuery;
  }

}).call(this);
