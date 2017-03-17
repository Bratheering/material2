import {task, src, dest} from 'gulp';
import {join} from 'path';
import {main as ngc} from '@angular/compiler-cli';
import {SOURCE_ROOT, DIST_ROOT} from '../constants';
import {sequenceTask} from '../util/task_helpers';
import {createRollupBundle} from '../util/rollup-helper';

const libraryRoot = join(SOURCE_ROOT, 'lib');
const tsconfigPath = join(libraryRoot, 'tsconfig.json');

const esmOutputPath = join(DIST_ROOT, 'packages', 'material');

task('library', sequenceTask(
  'clean',
  'library:build:esm',
  'library:build:fesm-2015'
));

task('library:build:esm', () => ngc(tsconfigPath, {basePath: libraryRoot}));

task('library:build:fesm-2015', () => {
  return src(join(esmOutputPath, 'index.js'))
    .pipe(createRollupBundle('es', 'material.js'))
    .pipe(dest(join(DIST_ROOT, 'bundles')));
});
