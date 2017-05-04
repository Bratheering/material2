import {join, basename} from 'path';
import {createRollupBundle} from '../rollup-helper';
import {transpileFile} from '../ts-compiler';
import {ScriptTarget, ModuleKind} from 'typescript';
import {sync as glob} from 'glob';
import {SOURCE_ROOT, DIST_ROOT, DIST_BUNDLES, PROJECT_ROOT} from '../../constants';
import {existsSync} from 'fs-extra';

import {
  inlinePackageMetadataFiles,
  copyFiles,
  updatePackageVersion,
  createTypingFile,
  createMetadataFile,
  addPureAnnotationsToFile,
  uglifyFile,
  remapSourcemap
} from './build-utils';

type BuildTasks = Map<string, Promise<void>>;

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

export async function buildPackages(entryFile: string, mainPath: string, mainPackage: string) {
  const buildTasks: BuildTasks = new Map();
  const pkgConfigPath = join(mainPath, 'package-config.json');
  const packageConfig = existsSync(pkgConfigPath) ? require(pkgConfigPath) : {};
  const subPackages = glob('*/', {cwd: mainPath}).map(pkgName => basename(pkgName));

  // Build all sub-packages before building the main entry point.
  await Promise.all(subPackages.map(subPackage => {
    return _runPackageBuild(subPackage, join(mainPath, subPackage));
  }));

  // Afterwards build the main entry point.
  await _runPackageBuild(mainPackage, mainPath);

  async function _runPackageBuild(packageName: string, packagePath: string) {
    if (buildTasks.has(packageName)) {
      return;
    }

    // Resolve dependencies for specified package.
    let packageDeps = (packageConfig[packageName] || []);

    // Add dependencies for each sub-package being built.
    packageDeps = packageDeps.concat(
      (packageConfig['*'] || []).filter((pkgName: string) => pkgName !== packageName)
    );

    console.log(packageName, packageDeps);

    // Wait for all dependencies to be built.
    await Promise.all(packageDeps.map((pkgName: string) => {
      return _runPackageBuild(pkgName, join(mainPackage, pkgName));
    }));

    const buildPromise = buildPackage(packageName, packagePath);

    buildTasks.set(packageName, buildPromise);

    return buildPromise;
  }
}

async function buildPackage(packageName: string, packagePath?: string) {
  console.log('Building', packageName);
}




/** Builds the bundles for the specified package. */
async function buildEntryPoint(entryFile: string, packageName: string, parentPackage = '') {
  let moduleName = parentPackage ? `ng.${parentPackage}.${packageName}` : `ng.${packageName}`;

  // List of paths to the package bundles.
  let fesm2015File = join(DIST_BUNDLES, parentPackage, `${packageName}.js`);
  let fesm2014File = join(DIST_BUNDLES, parentPackage, `${packageName}.es5.js`);
  let umdFile = join(DIST_BUNDLES, parentPackage, `${packageName}.umd.js`);
  let umdMinFile = join(DIST_BUNDLES, parentPackage, `${packageName}.umd.min.js`);

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

  await remapSourcemap(umdMinFile);
}



/** Creates a secondary entry point for a given package. */
function createSecondaryEntryPoint(mainPackageName: string, secondaryPackageName: string) {
  const releasePath = join(DIST_ROOT, 'releases', mainPackageName);
  const entryPath = join(releasePath, secondaryPackageName);

  const packageJson = {
    name: `@angular/${mainPackageName}/${secondaryPackageName}`,
    typings: `../typings/${secondaryPackageName}/index.d.ts`,
    main: `../bundles/${secondaryPackageName}.umd.js`,
    module: `../@angular/${mainPackageName}/${secondaryPackageName}.es5.js`,
    es2015: `../@angular/${mainPackageName}/${secondaryPackageName}.js`
  };

}
