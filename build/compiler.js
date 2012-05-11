var querystring = require('querystring'),
    http = require('http'),
    fs = require('fs'),
    util = require('util'),
    spawn = require('child_process').exec,
    common = require('./common'),
    StringStream = common.StringStream,
    compileErrorTest = /^error\([^\)]+?\):/i;

function closureCompilerService(source, level, callback) {
  var post_data, opts, req;
  
  post_data = querystring.stringify({
    'compilation_level': level || 'SIMPLE_OPTIMIZATIONS',
    'output_format': 'text',
    'output_info': 'compiled_code',
    'warning_level': 'QUIET',
    'js_code': source
  });
  
  if (level === 'WHITESPACE_ONLY') {
    post_data = 'formatting=pretty_print&' + post_data;
  }
  
  opts = {
    host:'closure-compiler.appspot.com',
    port: 80,
    path:'/compile',
    method:'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': post_data.length
    }
  };
  
  req = http.request(opts, function(res) {
    var results = '';
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      results += chunk.toString();
    });
    res.on('end', function () {
      var error = null;
      if (compileErrorTest.test(results)) {
        error = {
          message: results
        }
      }
      callback && callback(error, results);
    });
  });
  req.write(post_data + '\n');
  req.end();
}

function closureCompilerJar(source, level, callback) {
  var cmd = [
        'java',
        '-jar', 'bin/compiler.jar',
        '--warning_level','QUIET',
        '--third_party',
        '--compilation_level', level || 'SIMPLE_OPTIMIZATIONS'
      ],
      stream = new StringStream(source),
      child;
      
  if (level === 'WHITESPACE_ONLY') {
    cmd.push('--formatting','pretty_print')
  }
  
  child = spawn(cmd.join(' '), function(err, stdout, stderr) {
    var error = null;
    if (err || stderr !== '') {
      error = {
        message: stderr
      };
    }
    callback(error, stdout);
  });
  
  stream.pipe(child.stdin);
}

function uglifier(source, level, callback) {
  var parser = require( 'uglify-js' ).parser,
      uglify = require( 'uglify-js' ).uglify,
      opts, ast;
      
  opts = {
    mangle: {
      toplevel: false,
      except: ['require', 'module']
    },
    squeeze: {
      dead_code: true
    },
    gen: {
      beautify: false
    }
  }
  
  if (level === 'ADVANCED_OPTIMIZATIONS') {
    opts.mangle.toplevel = true;
  }else if (level ==='WHITESPACE_ONLY') {
    opts.squeeze.dead_code = false;
    opts.gen.beautify = true;
  }
      
  ast = uglify.ast_squeeze(uglify.ast_mangle( parser.parse( source.toString() ), opts.mangle ), opts.squeeze );
  callback(null, uglify.gen_code( ast, opts.gen ) );
}

function Compiler(opts) {
  var compiler = closureCompilerService,
      type = opts.type;
      
  if (type === 'jar') {
    compiler = closureCompilerJar;
  }else if (type === 'uglify') {
    compiler = uglifier;
  }
  
  this.compile = compiler;
};

module.exports = Compiler;
