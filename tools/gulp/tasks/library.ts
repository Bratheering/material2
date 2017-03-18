import {task, src, dest} from 'gulp';
import {join} from 'path';
import {main as ngc} from '@angular/compiler-cli';
import {SOURCE_ROOT, DIST_ROOT} from '../constants';
import {sequenceTask} from '../util/task_helpers';
import {createRollupBundle} from '../util/rollup-helper';
import {transpileFile} from '../util/ts-compiler';
import {ScriptTarget, ModuleKind} from 'typescript';

const libraryRoot = join(SOURCE_ROOT, 'lib');
const tsconfigPath = join(libraryRoot, 'tsconfig.json');

const packageDir = join(DIST_ROOT, 'packages');
const bundlesDir = join(DIST_ROOT, 'bundles');

const esmEntryFile = join(packageDir, 'material', 'index.js');
const fesm2015File = join(bundlesDir, 'material.js');
const fesm2014File = join(bundlesDir, 'material.es5.js');

task('library', sequenceTask(
  'clean',
  'library:build:esm',
  'library:build:fesm-2015',
  'library:build:fesm-2014'
));

task('library:build:esm', () => ngc(tsconfigPath, {basePath: libraryRoot}));

task('library:build:fesm-2015', ['library:build:esm'], () => {
  return src(esmEntryFile)
    .pipe(createRollupBundle('es', 'material.js'))
    .pipe(dest(bundlesDir));
});

task('library:build:fesm-2014', ['library:build:fesm-2015'], () => {
  transpileFile(fesm2015File, fesm2014File, {
    target: ScriptTarget.ES5,
    module: ModuleKind.ES2015,
    allowJs: true
  });
});
