import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout, Avatar, Dropdown, Button, theme } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useCurrentUser, logout } from '../api/me';
import MainNavigation from '../components/MainNavigation';
import sjLogo from '../assets/sj-logo-black.svg';

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, loading } = useCurrentUser();
  const { token } = theme.useToken();

  // Display name from SSO. Until /api/me lands we show a thin
  // placeholder so the header doesn't jump.
  const displayName = loading
    ? '…'
    : (user?.preferred_username || user?.email?.split('@')[0] || 'Signed in');

  const avatarInitials = (() => {
    const source = user?.preferred_username || user?.email || '';
    if (!source) return null;
    const parts = source.replace(/@.*$/, '').split(/[.\-_ ]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return null;
  })();

  const dropdownItems = {
    items: [
      {
        key: 'identity',
        disabled: true,
        label: (
          <div className="px-1 py-1">
            <div className="font-medium text-sm">{displayName}</div>
            {user?.email && (
              <div className="text-xs text-gray-500">{user.email}</div>
            )}
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: 'logout',
        danger: true,
        label: 'Sign out',
        icon: <LogoutOutlined />,
        onClick: logout,
      },
    ],
  };

  return (
    <Layout className="min-h-screen">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="dark"
        breakpoint="lg"
        collapsedWidth={80}
        width={220}
        style={{ background: '#0b1220' }}
      >
        <div
          className="flex items-center justify-center"
          style={{ height: 64, padding: collapsed ? '0 12px' : '0 16px' }}
        >
          <img
            src={sjLogo}
            alt="SwipeJobs"
            style={{
              height: collapsed ? 22 : 26,
              filter: 'invert(1) brightness(2)',
            }}
          />
        </div>
        {!collapsed && (
          <div
            className="text-center text-xs uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}
          >
            {'{{PROJECT_NAME}}'}
          </div>
        )}
        <MainNavigation />
      </Sider>
      <Layout>
        <Header
          className="px-4 flex items-center justify-between"
          style={{
            background: token.colorBgContainer,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="mr-auto"
            aria-label="Toggle sidebar"
          />

          <Dropdown menu={dropdownItems} placement="bottomRight" trigger={['click']}>
            <div className="flex items-center cursor-pointer hover:bg-gray-50 py-1 px-2 rounded-md ml-auto">
              <div className="mr-3 text-right max-w-[220px] hidden sm:block">
                <div className="font-medium truncate text-sm leading-tight">
                  {displayName}
                </div>
                {user?.email && (
                  <div className="text-xs text-gray-500 truncate leading-tight">
                    {user.email}
                  </div>
                )}
              </div>
              <Avatar
                size="small"
                style={{
                  background: avatarInitials ? '#1677ff' : '#bfbfbf',
                  fontSize: 12,
                }}
              >
                {avatarInitials || <UserOutlined />}
              </Avatar>
            </div>
          </Dropdown>
        </Header>
        <Content
          className="m-4 p-6 rounded"
          style={{ background: token.colorBgContainer }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
