import {task, src, dest, watch} from 'gulp';
import {join} from 'path';
import {main as ngc} from '@angular/compiler-cli';
import {SOURCE_ROOT, DIST_ROOT, UGLIFYJS_OPTIONS} from '../constants';
import {sequenceTask, sassBuildTask, copyTask, triggerLivereload} from '../util/task_helpers';
import {createRollupBundle} from '../util/rollup-helper';
import {transpileFile} from '../util/ts-compiler';
import {ScriptTarget, ModuleKind} from 'typescript';

// There are no type definitions available for these imports.
const gulpUglify = require('gulp-uglify');
const gulpRename = require('gulp-rename');
const inlineResources = require('../../../scripts/release/inline-resources');

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
  ['library:build:esm', 'library:assets'],
  // Inline assets into ESM output.
  'library:assets:inline',
  // Build bundles on top of inlined ESM output.
  'library:build:fesm-2015',
  'library:build:fesm-2014',
  'library:build:umd',
  'library:build:umd:min'
));

/** [Watch task] Rebuilds the library whenever TS, SCSS, or HTML files change. */
task('library:watch', () => {
  watch(join(libraryRoot, '**/*.ts'), ['build:components', triggerLivereload]);
  watch(join(libraryRoot, '**/*.scss'), ['build:components', triggerLivereload]);
  watch(join(libraryRoot, '**/*.html'), ['build:components', triggerLivereload]);
});

/**
 * TypeScript Compilation Tasks. Tasks are creating ESM, FESM, UMD bundles for releases.
 **/

task('library:build', sequenceTask(
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

/**
 * Asset Tasks. Building SaSS files and inlining CSS, HTML files into the ESM output.
 **/

task('library:assets', ['library:assets:scss', 'library:assets:html']);

task('library:assets:scss', sassBuildTask(materialDir, libraryRoot, true));
task('library:assets:html', copyTask(join(libraryRoot, '**/*.+(html|scss)'), materialDir));
task('library:assets:inline', () => inlineResources(materialDir));
