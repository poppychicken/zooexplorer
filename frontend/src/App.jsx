import { ConfigProvider, App as AntApp } from 'antd';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import routes from './routes';

// Design tokens. Everything not listed here follows antd's defaults on
// purpose — a token you override is a token you have to maintain.
const theme = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  },
  components: {
    Table: {
      headerBg: '#fafafa',
      rowHoverBg: 'rgba(0, 0, 0, 0.02)',
    },
  },
};

function AppRoutes() {
  return useRoutes(routes);
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      {/* AntApp supplies the message/notification/modal context that
          App.useApp() reads — without it those render unthemed. */}
      <AntApp>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
