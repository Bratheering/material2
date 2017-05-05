import {join, basename} from 'path';
import {createRollupBundle} from '../rollup-helper';
import {transpileFile} from '../ts-compiler';
import {ScriptTarget, ModuleKind} from 'typescript';
import {sync as glob} from 'glob';
import {SOURCE_ROOT, DIST_ROOT, DIST_BUNDLES, PROJECT_ROOT} from '../../constants';
import {existsSync} from 'fs-extra';
import {main as ngc} from '@angular/tsc-wrapped';

import {
  inlinePackageMetadataFiles,
  copyFiles,
  updatePackageVersion,
  createTypingFile,
  createMetadataFile,
  addPureAnnotationsToFile,
  uglifyFile,
  remapSourcemap,
  getSortedSecondaries,
  createPackageTsconfig
} from './build-utils';

/**
 * Copies different output files into a folder structure that follows the `angular/angular`
 * release folder structure. The output will also contain a README and the according package.json
 * file. Additionally the package will be Closure Compiler and AOT compatible.
 */
export function composeRelease(packageName: string) {
  // To avoid refactoring of the project the package material will map to the source path `lib/`.
  const sourcePath = join(SOURCE_ROOT, packageName === 'material' ? 'lib' : packageName);
  const packagePath = join(DIST_ROOT, 'packages', packageName);
  const releasePath = join(DIST_ROOT, 'releases', packageName);

  const umdOutput = join(releasePath, 'bundles');
  const fesmOutput = join(releasePath, '@angular');

  inlinePackageMetadataFiles(packagePath);

  // Copy primary entry point bundles
  copyFiles(DIST_BUNDLES, `${packageName}.umd?(.min).js?(.map)`, umdOutput);
  copyFiles(DIST_BUNDLES, `${packageName}?(.es5).js?(.map)`, fesmOutput);

  // Copy secondary entry point bundles.
  copyFiles(DIST_BUNDLES, `${packageName}/!(*.umd)?(.min).js?(.map)`, fesmOutput);
  copyFiles(join(DIST_BUNDLES, packageName), `*.umd?(.min).js?(.map)`, umdOutput);

  copyFiles(packagePath, '**/*.+(d.ts|metadata.json)', join(releasePath, 'typings'));
  copyFiles(PROJECT_ROOT, 'LICENSE', releasePath);
  copyFiles(SOURCE_ROOT, 'README.md', releasePath);
  copyFiles(sourcePath, 'package.json', releasePath);

  updatePackageVersion(releasePath);
  createTypingFile(releasePath, packageName);
  createMetadataFile(releasePath, packageName);
}

export async function createPackageOutput(buildPackage: BuildPackage) {
  // Create package output for each secondary package.
  for (const secondaryPackage of buildPackage.secondaries) {
    await createPackageOutput(secondaryPackage);
  }
  
  const packageTsconfig = createPackageTsconfig(buildPackage);

  console.log('Building', buildPackage.name);

  await ngc(packageTsconfig, {basePath: ''});

  console.log('Done', buildPackage.name);
}


/** Builds the bundles for the specified package. */
async function buildPackageBundles(buildPackage: BuildPackage) {
  const {name, moduleName, outputPath} = buildPackage;
  const entryFile = join(outputPath, 'index.js');

  /*

  // List of paths to the package bundles.
  let fesm2015File = join(DIST_BUNDLES, buildPackage.parent.name, `${name}.js`);
  let fesm2014File = join(DIST_BUNDLES, parentPackage, `${name}.es5.js`);
  let umdFile = join(DIST_BUNDLES, parentPackage, `${name}.umd.js`);
  let umdMinFile = join(DIST_BUNDLES, parentPackage, `${name}.umd.min.js`);

  // Build FESM-2015 bundle file.
  await createRollupBundle({
    moduleName: moduleName,
    entry: entryFile,
    dest: fesm2015File,
    format: 'es',
  });

  await remapSourcemap(fesm2015File);

  // Downlevel FESM-2015 file to ES5.
  transpileFile(fesm2015File, fesm2014File, {
    target: ScriptTarget.ES5,
    module: ModuleKind.ES2015,
    allowJs: true
  });

  // Add pure annotation to ES5 bundles.
  addPureAnnotationsToFile(fesm2014File);

  await remapSourcemap(fesm2014File);

  // Create UMD bundle of FESM-2014 output.
  await createRollupBundle({
    moduleName: moduleName,
    entry: fesm2014File,
    dest: umdFile,
    format: 'umd'
  });

  await remapSourcemap(umdFile);

  uglifyFile(umdFile, umdMinFile);

  await remapSourcemap(umdMinFile);*/
}

export class BuildPackage {

  /** Path to ESM output of the package. */
  outputPath: string = null;

  /** Path to the composed release of the package. */
  releasePath: string = null;

  /** Module name of the package. Used to built UMD bundles. */
  moduleName: string = null;

  /** Build packages that can be secondary entry-points. */
  secondaries: BuildPackage[] = [];

  constructor(public name: string, public sourcePath: string, public parent?: BuildPackage) {
    this.outputPath = join(DIST_ROOT, 'packages', name);
    this.releasePath = join(DIST_ROOT, 'releases', name);
    this.moduleName =  parent ? `ng.${parent.name}.${name}` : `ng.${name}`;

    if (!parent) {
      // Resolve secondary packages by searching for folders inside of the current package.
      this.secondaries = getSortedSecondaries(this).map(pkgName => {
        return new BuildPackage(basename(pkgName), join(sourcePath, pkgName), this);
      });
    }
  }
}
