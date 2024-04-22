const path = require('path');
const { ModuleFederationPlugin } = require('webpack').container;
const HtmlWebpackPlugin = require('html-webpack-plugin');

const getRemote = (name, url) => (resolve => {
  const script = document.createElement('script');
  script.src = '__URL__';
  script.onload = () => {
    resolve({
      get: (request) => window['__NAME__'].get(request),
      init: (arg) => {
        try {
          return window['__NAME__'].init(arg);
        } catch (e) {
          console.error('remote container already initialized');
        }
      },
    });
  };
  document.head.appendChild(script);
}).toString().replace(/__NAME__/g, name).replace(/__URL__/g, url);

module.exports = {
  mode: 'development',
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'build/[name].js',
    library: { type: 'var', name: 'main_app' },
  },
  devtool: 'cheap-source-map',
  optimization: {
    runtimeChunk: {
      name: 'runtime',
    },
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'main_app',
      filename: 'remote-entry.js',
      exposes: {
        '.': './remote-entry.js',
      },
      remotes: {
        'sub_app': `promise new Promise(${getRemote('sub_app', 'http://localhost:3001/remote-entry.js')})`,
        // 'sub_app': 'sub_app@http://localhost:3001/remote-entry.js',
      },
    }),
    new HtmlWebpackPlugin(),
  ],
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },
};
