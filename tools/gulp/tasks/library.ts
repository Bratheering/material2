import {task, src, dest} from 'gulp';
import {join} from 'path';
import {main as ngc} from '@angular/compiler-cli';
import {SOURCE_ROOT, DIST_ROOT, UGLIFYJS_OPTIONS} from '../constants';
import {sequenceTask} from '../util/task_helpers';
import {createRollupBundle} from '../util/rollup-helper';
import {transpileFile} from '../util/ts-compiler';
import {ScriptTarget, ModuleKind} from 'typescript';

// There are no type definitions available for these imports.
const gulpUglify = require('gulp-uglify');
const gulpRename = require('gulp-rename');

const libraryRoot = join(SOURCE_ROOT, 'lib');
const tsconfigPath = join(libraryRoot, 'tsconfig.json');

// Paths to the different output directories.
const materialDir = join(DIST_ROOT, 'packages', 'material');
const bundlesDir = join(DIST_ROOT, 'bundles');

// Paths to the different output files.
const esmMainFile = join(materialDir, 'index.js');
const fesm2015File = join(bundlesDir, 'material.js');
const fesm2014File = join(bundlesDir, 'material.es5.js');
const umdBundleFile = join(bundlesDir, 'material.umd.js');

task('library', sequenceTask(
  'clean',
  'library:build:esm',
  'library:build:fesm-2015',
  'library:build:fesm-2014',
  'library:build:umd',
  'library:build:umd:min'
));

task('library:build:esm', () => ngc(tsconfigPath, {basePath: libraryRoot}));

task('library:build:fesm-2015', () => {
  return src(esmMainFile)
    .pipe(createRollupBundle('es', 'material.js'))
    .pipe(dest(bundlesDir));
});

task('library:build:fesm-2014', () => {
  transpileFile(fesm2015File, fesm2014File, {
    target: ScriptTarget.ES5,
    module: ModuleKind.ES2015,
    allowJs: true
  });
});

task('library:build:umd', () => {
  return src(fesm2014File)
    .pipe(createRollupBundle('umd', 'material.umd.js'))
    .pipe(dest(bundlesDir));
});

task('library:build:umd:min', () => {
  return src(umdBundleFile)
    .pipe(gulpUglify(UGLIFYJS_OPTIONS))
    .pipe(gulpRename({suffix: '.min'}))
    .pipe(dest(bundlesDir));
});
