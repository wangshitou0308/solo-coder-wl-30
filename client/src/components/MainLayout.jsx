import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Button } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  DashboardOutlined,
  ProjectOutlined,
  CalendarOutlined,
  ShoppingCartOutlined,
  BarChartOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  FileTextOutlined,
  TeamOutlined,
  LineChartOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const roleNames = {
  seller: '售票员',
  scheduler: '排期管理员',
  manager: '剧院经理',
  finance: '财务',
};

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getMenuItems = () => {
    const items = [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: '首页',
      },
    ];

    if (hasRole('scheduler', 'manager')) {
      items.push({
        key: '/performances',
        icon: <ProjectOutlined />,
        label: '演出项目',
      });
    }

    items.push({
      key: '/shows',
      icon: <CalendarOutlined />,
      label: '场次排期',
    });

    if (hasRole('seller', 'scheduler', 'manager')) {
      items.push({
        key: '/sales',
        icon: <ShoppingCartOutlined />,
        label: '售票管理',
      });
    }

    items.push({
      key: '/orders',
      icon: <FileTextOutlined />,
      label: '订单管理',
    });

    if (hasRole('manager', 'finance')) {
      items.push({
        key: '/statistics',
        icon: <BarChartOutlined />,
        label: '统计分析',
        children: [
          {
            key: '/statistics/box-office',
            icon: <BarChartOutlined />,
            label: '票房统计',
          },
          {
            key: '/statistics/settlement',
            icon: <TeamOutlined />,
            label: '结算分账',
          },
          {
            key: '/statistics/repertoire',
            icon: <FileTextOutlined />,
            label: '剧目库',
          },
          {
            key: '/statistics/audience-analysis',
            icon: <LineChartOutlined />,
            label: '观众偏好分析',
          },
        ],
      });
    }

    if (hasRole('manager')) {
      items.push({
        key: '/settings',
        icon: <SettingOutlined />,
        label: '系统设置',
        children: [
          {
            key: '/settings/theaters',
            icon: <SettingOutlined />,
            label: '剧场与剧团',
          },
        ],
      });
    }

    return items;
  };

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userMenu = {
    items: [
      {
        key: '1',
        label: (
          <span>
            <UserOutlined /> {user?.name}
          </span>
        ),
        disabled: true,
      },
      {
        key: '2',
        label: (
          <span>
            <SettingOutlined /> 角色：{roleNames[user?.role]}
          </span>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: '3',
        label: (
          <span onClick={handleLogout}>
            <LogoutOutlined /> 退出登录
          </span>
        ),
      },
    ],
  };

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/statistics')) {
      return ['/statistics', path];
    }
    if (path.startsWith('/settings')) {
      return ['/settings', path];
    }
    return [path];
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div className="layout-logo">
          {collapsed ? '剧院' : '剧院管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKeys()}
          openKeys={['/statistics', '/settings']}
          items={getMenuItems()}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header 
          style={{ 
            background: '#fff', 
            padding: '0 16px', 
            display: 'flex', 
            justifyContent: 'flex-end',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)'
          }}
        >
          <Dropdown menu={userMenu} placement="bottomRight">
            <div className="user-info" style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{user?.name}</span>
            </div>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: '24px',
            background: '#fff',
            borderRadius: '8px',
            minHeight: 'calc(100vh - 112px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
