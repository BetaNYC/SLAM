import svelte from 'rollup-plugin-svelte'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import livereload from 'rollup-plugin-livereload'
import { terser } from 'rollup-plugin-terser'
import replace from '@rollup/plugin-replace'
import babel from 'rollup-plugin-babel'

require('dotenv').config()

const production = !process.env.ROLLUP_WATCH

const { CARTO_API_KEY, GEOCLIENT_ID, GEOCLIENT_KEY } = process.env

export default {
  input: 'src/main.js',
  output: {
    sourcemap: true,
    format: 'iife',
    name: 'app',
    file: 'public/build/bundle.js'
  },
  plugins: [
    svelte({
      // enable run-time checks when not in production
      dev: !production,
      // we'll extract any component CSS out into
      // a separate file — better for performance
      css: css => {
        css.write('public/build/bundle.css')
      }
    }),
    replace({
      CARTO_API_KEY: `'${CARTO_API_KEY}'`,
      GEOCLIENT_ID: `'${GEOCLIENT_ID}'`,
      GEOCLIENT_KEY: `'${GEOCLIENT_KEY}'`
    }),

    // If you have external dependencies installed from
    // npm, you'll most likely need these plugins. In
    // some cases you'll need additional configuration —
    // consult the documentation for details:
    // https://github.com/rollup/plugins/tree/master/packages/commonjs
    resolve({
      browser: true,
      dedupe: ['svelte']
    }),
    commonjs(),
    production &&
      babel({
        extensions: ['.js', '.mjs', '.html', '.svelte'],
        runtimeHelpers: true,
        exclude: ['node_modules/@babel/**', 'node_modules/core-js/**'],
        presets: [
          [
            '@babel/preset-env',
            {
              targets: '> 0.25%, not dead, IE 11',
              useBuiltIns: 'usage',
              corejs: 3
            }
          ]
        ],
        plugins: [
          '@babel/plugin-syntax-dynamic-import',
          '@babel/plugin-transform-runtime'
        ]
      }),

    // In dev mode, call `npm run start` once
    // the bundle has been generated
    !production && serve(),

    // Watch the `public` directory and refresh the
    // browser on changes when not in production
    !production && livereload('public'),

    // If we're building for production (npm run build
    // instead of npm run dev), minify
    production && terser()
  ],
  watch: {
    clearScreen: false
  }
}

function serve() {
  let started = false

  return {
    writeBundle() {
      if (!started) {
        started = true

        require('child_process').spawn('npm', ['run', 'start', '--', '--dev'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        })
      }
    }
  }
}
