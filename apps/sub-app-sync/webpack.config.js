const path = require('path');
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  mode: 'development',
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'build/[name].js',
    library: { type: 'var', name: 'sub_app_sync' },
  },
  devtool: 'cheap-source-map',
  plugins: [
    new ModuleFederationPlugin({
      name: 'sub_app_sync',
      filename: 'remote-entry.js',
      exposes: {
        '.': './remote-entry.js',
      },
      remotes: {
        'main_app': 'main_app@http://localhost:3000/remote-entry.js',
      },
    }),
  ],
  devServer: {
    host: '0.0.0.0',
    port: 3002,
  },
};
