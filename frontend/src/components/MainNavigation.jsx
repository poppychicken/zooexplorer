import { Menu, Tooltip } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  AppstoreOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { logout } from '../api/me';

export default function MainNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: 'dashboard',
      icon: (
        <Tooltip title="Dashboard" placement="right">
          <DashboardOutlined />
        </Tooltip>
      ),
      label: 'Dashboard',
      onClick: () => navigate('/dashboard'),
    },
    {
      key: 'items',
      icon: (
        <Tooltip title="Items" placement="right">
          <AppstoreOutlined />
        </Tooltip>
      ),
      label: 'Items',
      onClick: () => navigate('/items'),
    },
    // Add more navigation items here as you build out your app
  ];

  // Logout goes through oauth2-proxy's /oauth2/sign_out — clears the
  // SSO cookie on .shared-dev.swipejobs.com and bounces back to /.
  const logoutItem = [
    {
      key: 'logout',
      icon: (
        <Tooltip title="Logout" placement="right">
          <LogoutOutlined />
        </Tooltip>
      ),
      label: 'Logout',
      onClick: logout,
      danger: true,
    },
  ];

  // Determine which item is active
  let activeKey;
  if (location.pathname.startsWith('/dashboard') || location.pathname === '/') {
    activeKey = 'dashboard';
  } else if (location.pathname.startsWith('/items')) {
    activeKey = 'items';
  }

  return (
    <div className="flex flex-col h-full">
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[activeKey]}
        items={menuItems}
        className="flex-1"
      />
      <Menu
        theme="dark"
        mode="inline"
        selectable={false}
        items={logoutItem}
        className="mt-auto"
      />
    </div>
  );
}
