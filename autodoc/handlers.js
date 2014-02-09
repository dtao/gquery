this.exampleHandlers = [
  {
    pattern: /^collection: (.*)$/,
    template: 'collection_equality',
    data: function(match) {
      return { elements: match[1] };
    }
  }
];
