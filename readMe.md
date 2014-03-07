####Concatenate Javascript Files With Sourcemaps

__Installation__

```
npm install js-cat
```

__Usage__

```javascript

jsCat = require('js-cat');

//From Code

var files = [
	{code : '<Javascript Source Code>', map: '<optional><old sourcemap>', path: '<Path of File>'},
	{code : '<Javascript Source Code>', map: '<optional><old sourcemap>', path: '<Path of File>'}
]

jsCat.concatSource(files, { mapFilePath : 'output.min.map' }, function(err, data) {
	
	if(err) return console.log(err);
	
	console.log(data.code, data.map);

})

//From Files List

jsCat.concatFiles(['test1.js', 'test2.js'], { mapFilePath : 'output.min.map' }, function(err, data) {
	
	if(err) return console.log(err);
	
	console.log(data.code, data.map);

})

```

__License__

MIT
