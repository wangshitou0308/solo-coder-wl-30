import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import PerformanceList from './pages/performances/PerformanceList';
import PerformanceForm from './pages/performances/PerformanceForm';
import ShowList from './pages/shows/ShowList';
import ShowForm from './pages/shows/ShowForm';
import TicketDesign from './pages/tickets/TicketDesign';
import SeatSales from './pages/sales/SeatSales';
import SalesList from './pages/sales/SalesList';
import OrderList from './pages/orders/OrderList';
import OrderDetail from './pages/orders/OrderDetail';
import BoxOffice from './pages/statistics/BoxOffice';
import Settlement from './pages/statistics/Settlement';
import Repertoire from './pages/statistics/Repertoire';
import AudienceAnalysis from './pages/statistics/AudienceAnalysis';
import Theaters from './pages/settings/Theaters';
import SettlementManage from './pages/settlements/SettlementManage';
import AuditLog from './pages/audit/AuditLog';
import RefundRules from './pages/settings/RefundRules';

const PrivateRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }
  
  return children;
};

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={
        <PrivateRoute>
          <MainLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        
        <Route path="performances">
          <Route index element={
            <PrivateRoute roles={['scheduler', 'manager']}>
              <PerformanceList />
            </PrivateRoute>
          } />
          <Route path="new" element={
            <PrivateRoute roles={['scheduler', 'manager']}>
              <PerformanceForm />
            </PrivateRoute>
          } />
          <Route path="edit/:id" element={
            <PrivateRoute roles={['scheduler', 'manager']}>
              <PerformanceForm />
            </PrivateRoute>
          } />
        </Route>
        
        <Route path="shows">
          <Route index element={
            <PrivateRoute roles={['scheduler', 'manager', 'seller']}>
              <ShowList />
            </PrivateRoute>
          } />
          <Route path="new" element={
            <PrivateRoute roles={['scheduler', 'manager']}>
              <ShowForm />
            </PrivateRoute>
          } />
          <Route path=":id/ticket-design" element={
            <PrivateRoute roles={['scheduler', 'manager']}>
              <TicketDesign />
            </PrivateRoute>
          } />
          <Route path=":id/sales" element={
            <PrivateRoute roles={['seller', 'scheduler', 'manager']}>
              <SeatSales />
            </PrivateRoute>
          } />
        </Route>

        <Route path="sales">
          <Route index element={
            <PrivateRoute roles={['seller', 'scheduler', 'manager']}>
              <SalesList />
            </PrivateRoute>
          } />
        </Route>
        
        <Route path="orders">
          <Route index element={
            <PrivateRoute roles={['seller', 'scheduler', 'manager', 'finance']}>
              <OrderList />
            </PrivateRoute>
          } />
          <Route path=":id" element={
            <PrivateRoute roles={['seller', 'scheduler', 'manager', 'finance']}>
              <OrderDetail />
            </PrivateRoute>
          } />
        </Route>
        
        <Route path="statistics">
          <Route path="box-office" element={
            <PrivateRoute roles={['manager', 'finance']}>
              <BoxOffice />
            </PrivateRoute>
          } />
          <Route path="settlement" element={
            <PrivateRoute roles={['manager', 'finance']}>
              <Settlement />
            </PrivateRoute>
          } />
          <Route path="repertoire" element={
            <PrivateRoute roles={['manager', 'finance']}>
              <Repertoire />
            </PrivateRoute>
          } />
          <Route path="audience-analysis" element={
            <PrivateRoute roles={['manager', 'finance']}>
              <AudienceAnalysis />
            </PrivateRoute>
          } />
        </Route>

        <Route path="settlements" element={
          <PrivateRoute roles={['manager', 'finance']}>
            <SettlementManage />
          </PrivateRoute>
        } />

        <Route path="audit" element={
          <PrivateRoute roles={['manager', 'finance']}>
            <AuditLog />
          </PrivateRoute>
        } />

        <Route path="settings/theaters" element={
          <PrivateRoute roles={['manager']}>
            <Theaters />
          </PrivateRoute>
        } />
        <Route path="settings/refund-rules" element={
          <PrivateRoute roles={['manager', 'finance']}>
            <RefundRules />
          </PrivateRoute>
        } />
      </Route>
      
      <Route path="/403" element={
        <div style={{ padding: 50, textAlign: 'center' }}>
          <h1>403</h1>
          <p>您没有权限访问此页面</p>
        </div>
      } />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
