/** Type declaration for ambient System. */
declare const System: any;

// Apply the CLI SystemJS configuration.
System.config({
  map: {
    'rxjs': 'node_modules/rxjs',
    'main': 'main.js',

    // Angular specific mappings.
    '@angular/core': 'node_modules/@angular/core/bundles/core.umd.js',
    '@angular/common': 'node_modules/@angular/common/bundles/common.umd.js',
    '@angular/compiler': 'node_modules/@angular/compiler/bundles/compiler.umd.js',
    '@angular/http': 'node_modules/@angular/http/bundles/http.umd.js',
    '@angular/forms': 'node_modules/@angular/forms/bundles/forms.umd.js',
    '@angular/router': 'node_modules/@angular/router/bundles/router.umd.js',
    '@angular/animations': 'node_modules/@angular/animations/bundles/animations.umd.js',
    '@angular/animations/browser':
      'node_modules/@angular/animations/bundles/animations-browser.umd.js',
    '@angular/platform-browser':
      'node_modules/@angular/platform-browser/bundles/platform-browser.umd.js',
    '@angular/platform-browser/animations':
      'node_modules/@angular/platform-browser/bundles/platform-browser-animations.umd.js',
    '@angular/platform-browser-dynamic':
      'node_modules/@angular/platform-browser-dynamic/bundles/platform-browser-dynamic.umd.js',
    '@angular/material': 'dist/bundles/material.umd.js'
  },
  packages: {
    // Thirdparty barrels.
    'rxjs': { main: 'index' },
    // Set the default extension for the root package, because otherwise the demo-app can't
    // be built within the production mode. Due to missing file extensions.
    '.': {
      defaultExtension: 'js'
    }
  }
});
