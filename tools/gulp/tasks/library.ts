import {task} from 'gulp';
import {join} from 'path';
import {main as ngc} from '@angular/compiler-cli';
import {SOURCE_ROOT} from '../constants';
import {sequenceTask} from '../util/task_helpers';

const libraryRoot = join(SOURCE_ROOT, 'lib');
const tsconfigPath = join(libraryRoot, 'tsconfig.json');

task('library', sequenceTask('clean', 'library:build:esm'));

task('library:build:esm', () => ngc(tsconfigPath, {basePath: libraryRoot}));

// task('library:build:fesm-2015', () => )
