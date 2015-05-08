#!/usr/bin/env node

var fs = require('fs');
var https = require('https');
var path = require('path');

var p = parse(process.argv[2]);
var version = process.argv[3];

if (!p.platform || !p.arch || !version || !p.product) {
    console.warn("Use: " + process.argv[0] + " " + process.argv[1] + " {node,iojs}-{platform}-{arch} version");
    process.exit(1);
    return;
}

var isWin = p.platform === 'win32'

function go(platform, arch, version, product, cb) {
    var dir = product + "-" + platform + '-' + arch;
    var base = product + "-v" + version + "-" + platform + "-" + arch;
    var filename = base + ".tar.gz";
    var package = {
        name: product + "-" + platform + "-" + arch,
        version: version,
        description: product,
        scripts: {
            preinstall: "tar xzf " + filename
        },
        bin: {
            node: path.join(base, "bin/node")
        },
        files: [
            filename
        ],
        repository: {
            type: "git",
            url: "https://github.com/aredridel/" + product + "-bin"
        }
    };

    if (isWin) {
        var subDir = dir + '/' + base;
        var fullDir = subDir + '/bin';
        delete package.scripts.preinstall;
        package.files = ['node.exe', 'node.lib'];
        package.bin = {
          node: './node.exe'
        };
        if (product == 'iojs') {
          package.bin.iojs = './iojs.exe';
          package.files.push('iojs.exe');
          package.files.push('iojs.lib');
        }
    }

    if (product == "iojs") {
        package.bin.iojs = path.join(base, "bin/iojs");
    }

    if (isWin) {
        var opts = {
            product: product,
            platform: platform,
            arch: arch,
            version: version
        };
        return getWin(opts, dir, package, cb);
    }

    fs.mkdir(dir, function (err) {
        if (err && err.code != 'EEXIST') {
            return cb(err);
        }
        var req = https.get({hostname: (product == "iojs" ? "iojs.org" : "nodejs.org"), path: "/dist/v" + version + "/" + filename});
        req.on('error', cb);
        req.on('response', function (res) {
            if (res.statusCode != 200) return cb("not ok: " + res.statusCode);

            res.pipe(fs.createWriteStream(path.join(dir, filename))).on('error', function (err) {
                return cb(err);
            }).on('finish', function () {
                fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(package), function (err) {
                    return cb(err);
                });
            });
        });
    });
}

function getWin(opts, dir, package, cb) {
    var isIO = opts.product === 'iojs';

    var filenames = ['node.exe', 'node.lib'];

    function next() {
      if (!filenames.length) {
          return fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(package, null, 2), function (err) {
              return cb(err);
          });
      }

      var item = filenames.shift();

      getAndWriteFile(dir, opts, item, function (err) {
          if (err) return cb(err);
          next()
      })
    }

    fs.mkdir(dir, function (err) {
        if (err && err.code != 'EEXIST') {
            return cb(err);
        }

        next();
    });
}

// for windows
// need to get /win-{x86,x64}/iojs.{exe,lib} for iojs
// need to get /node.{exe,lib} or /x86/node.{exe,lib} for node
function getAndWriteFile(dir, opts, filename, cb) {
    var isIO = opts.product === 'iojs';
    var urlpath = isIO
      ? 'win' + opts.arch + '/' + filename
      : opts.arch === 'x86'
      ? filename
      : 'x64/' + filename;

    var options = {
        hostname: opts.product === 'iojs' ? 'iojs.org' : 'nodejs.org',
        path: '/dist/v' + opts.version + '/' + urlpath
    };

    var req = https.get(options);
    req.on('error', cb);
    req.on('response', function (res) {
        if (res.statusCode != 200) return cb("not ok: " + res.statusCode);
        res.pipe(fs.createWriteStream(path.join(dir, filename))).on('error', function (err) {
            return cb(err);
        }).on('finish', cb);
    });
}

go(p.platform, p.arch, version, p.product, function (err) {
    if (err) {
        console.warn(err);
        process.exit(1);
    }
});

function parse(str) {
    var out = {};
    var parts = (str || '').split('-');
    out.product = parts[0];
    out.platform = parts[1];
    out.arch = parts[2];
    return out;
}
