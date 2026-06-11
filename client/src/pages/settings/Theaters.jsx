import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Modal, Form, Input, Select, InputNumber,
  message, Space, Tabs, Tag, Popconfirm, Row, Col, Statistic
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { theaterAPI, showAPI } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const layoutTypeMap = {
  proscenium: { text: '镜框式', color: 'blue' },
  thrust: { text: '三面台', color: 'green' },
  blackbox: { text: '黑匣子', color: 'purple' },
};

const formatCurrency = (value) => {
  if (!value && value !== 0) return '-';
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
};

const Theaters = () => {
  const [theaters, setTheaters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [theaterModalVisible, setTheaterModalVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [editingTheater, setEditingTheater] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [selectedTheater, setSelectedTheater] = useState(null);
  
  const [theaterForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [templateForm] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [theaterRes, groupRes] = await Promise.all([
        theaterAPI.listTheaters(),
        theaterAPI.listGroups(),
      ]);
      setTheaters(theaterRes.data.theaters);
      setGroups(groupRes.data.groups);
    } catch (err) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async (theaterId) => {
    try {
      const res = await theaterAPI.listTemplates({ theater_id: theaterId });
      setTemplates(res.data.templates);
    } catch (err) {
      message.error('加载座位模板失败');
    }
  };

  const handleTheaterSubmit = async (values) => {
    try {
      if (editingTheater) {
        message.success('剧场更新成功');
      } else {
        await theaterAPI.createTheater(values);
        message.success('剧场创建成功');
      }
      setTheaterModalVisible(false);
      theaterForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleGroupSubmit = async (values) => {
    try {
      if (editingGroup) {
        message.success('剧团更新成功');
      } else {
        await theaterAPI.createGroup(values);
        message.success('剧团创建成功');
      }
      setGroupModalVisible(false);
      groupForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleGenerateTemplate = async (theaterId) => {
    try {
      const res = await theaterAPI.generateTemplate(theaterId, { name: '标准模板' });
      message.success('座位模板生成成功');
      if (selectedTheater === theaterId) {
        loadTemplates(theaterId);
      }
    } catch (err) {
      message.error(err.response?.data?.message || '生成失败');
    }
  };

  const handleTemplateSubmit = async (values) => {
    try {
      await theaterAPI.createTemplate({
        theater_id: selectedTheater,
        name: values.name,
        layout_data: generateLayoutData(values),
      });
      message.success('模板创建成功');
      setTemplateModalVisible(false);
      templateForm.resetFields();
      loadTemplates(selectedTheater);
    } catch (err) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const generateLayoutData = (values) => {
    const zones = ['VIP', 'A', 'B', 'C'];
    const layout = { rows: [], zones: {} };
    const totalSeats = values.vip_seats + values.a_seats + values.b_seats + values.c_seats;
    const seatsPerRow = Math.ceil(Math.sqrt(totalSeats * 1.5));
    
    let currentZone = 0;
    let seatsInCurrentZone = 0;
    const zoneSeats = [values.vip_seats, values.a_seats, values.b_seats, values.c_seats];
    const zonePrices = [values.vip_price, values.a_price, values.b_price, values.c_price];
    
    const rowsCount = Math.ceil(totalSeats / seatsPerRow);
    let seatCount = 0;
    
    for (let r = 1; r <= rowsCount && seatCount < totalSeats; r++) {
      const rowLabel = String.fromCharCode(64 + r);
      const row = { label: rowLabel, seats: [] };
      
      for (let s = 1; s <= seatsPerRow && seatCount < totalSeats; s++) {
        if (seatsInCurrentZone >= zoneSeats[currentZone]) {
          currentZone++;
          seatsInCurrentZone = 0;
        }
        if (currentZone < zones.length) {
          row.seats.push({
            number: s,
            zone: zones[currentZone],
            x: (s - 1) * 40 + 50,
            y: (r - 1) * 40 + 50
          });
          seatsInCurrentZone++;
          seatCount++;
        }
      }
      layout.rows.push(row);
    }
    
    zones.forEach((zone, i) => {
      layout.zones[zone] = {
        price: zonePrices[i] || 0,
        color: zone === 'VIP' ? '#FFD700' : zone === 'A' ? '#FF6B6B' : zone === 'B' ? '#4ECDC4' : '#95A5A6'
      };
    });
    
    return layout;
  };

  const theaterColumns = [
    { title: '剧场名称', dataIndex: 'name', key: 'name' },
    {
      title: '布局类型', dataIndex: 'layout_type', key: 'layout_type',
      render: (type) => {
        const info = layoutTypeMap[type] || { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    { title: '总座位数', dataIndex: 'total_seats', key: 'total_seats' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '操作', key: 'action',
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            icon={<SettingOutlined />}
            onClick={() => {
              setSelectedTheater(record.id);
              loadTemplates(record.id);
            }}
          >
            座位模板
          </Button>
          <Button
            type="link"
            icon={<PlusOutlined />}
            onClick={() => handleGenerateTemplate(record.id)}
          >
            生成模板
          </Button>
        </Space>
      )
    }
  ];

  const groupColumns = [
    { title: '剧团名称', dataIndex: 'name', key: 'name' },
    { title: '联系人', dataIndex: 'contact', key: 'contact' },
    { title: '联系电话', dataIndex: 'phone', key: 'phone' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString('zh-CN')
    }
  ];

  const templateColumns = [
    { title: '模板名称', dataIndex: 'name', key: 'name' },
    { title: '所属剧场', dataIndex: 'theater_name', key: 'theater_name' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString('zh-CN')
    }
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>剧场与剧团管理</h2>
      
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic title="剧场总数" value={theaters.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic title="剧团总数" value={groups.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic 
              title="总座位数" 
              value={theaters.reduce((sum, t) => sum + t.total_seats, 0)} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic title="座位模板数" value={templates.length} />
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="theaters">
        <TabPane tab="剧场管理" key="theaters">
          <Card
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingTheater(null);
                  theaterForm.resetFields();
                  setTheaterModalVisible(true);
                }}
              >
                添加剧场
              </Button>
            }
          >
            <Table
              columns={theaterColumns}
              dataSource={theaters}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>

          {selectedTheater && (
            <Card
              title="座位模板"
              style={{ marginTop: 24 }}
              extra={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    templateForm.resetFields();
                    setTemplateModalVisible(true);
                  }}
                >
                  创建模板
                </Button>
              }
            >
              <Table
                columns={templateColumns}
                dataSource={templates}
                rowKey="id"
                pagination={{ pageSize: 10 }}
              />
            </Card>
          )}
        </TabPane>

        <TabPane tab="剧团管理" key="groups">
          <Card
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingGroup(null);
                  groupForm.resetFields();
                  setGroupModalVisible(true);
                }}
              >
                添加剧团
              </Button>
            }
          >
            <Table
              columns={groupColumns}
              dataSource={groups}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>
      </Tabs>

      <Modal
        title={editingTheater ? '编辑剧场' : '添加剧场'}
        open={theaterModalVisible}
        onCancel={() => setTheaterModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={theaterForm}
          layout="vertical"
          onFinish={handleTheaterSubmit}
          initialValues={editingTheater}
        >
          <Form.Item
            name="name"
            label="剧场名称"
            rules={[{ required: true, message: '请输入剧场名称' }]}
          >
            <Input placeholder="请输入剧场名称" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="layout_type"
                label="布局类型"
                rules={[{ required: true, message: '请选择布局类型' }]}
              >
                <Select placeholder="请选择布局类型">
                  <Option value="proscenium">镜框式舞台</Option>
                  <Option value="thrust">三面台</Option>
                  <Option value="blackbox">黑匣子剧场</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="total_seats"
                label="总座位数"
                rules={[{ required: true, message: '请输入总座位数' }]}
              >
                <InputNumber
                  min={1}
                  max={5000}
                  placeholder="请输入座位数"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入剧场描述" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingTheater ? '更新' : '创建'}
              </Button>
              <Button onClick={() => setTheaterModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingGroup ? '编辑剧团' : '添加剧团'}
        open={groupModalVisible}
        onCancel={() => setGroupModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={groupForm}
          layout="vertical"
          onFinish={handleGroupSubmit}
          initialValues={editingGroup}
        >
          <Form.Item
            name="name"
            label="剧团名称"
            rules={[{ required: true, message: '请输入剧团名称' }]}
          >
            <Input placeholder="请输入剧团名称" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact" label="联系人">
                <Input placeholder="请输入联系人" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="联系电话">
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingGroup ? '更新' : '创建'}
              </Button>
              <Button onClick={() => setGroupModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="创建座位模板"
        open={templateModalVisible}
        onCancel={() => setTemplateModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form
          form={templateForm}
          layout="vertical"
          onFinish={handleTemplateSubmit}
          initialValues={{
            vip_price: 880,
            a_price: 580,
            b_price: 380,
            c_price: 180,
          }}
        >
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="请输入模板名称" />
          </Form.Item>
          
          <h4>座位分区配置</h4>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="vip_seats"
                label="VIP区座位数"
                rules={[{ required: true, message: '请输入座位数' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="vip_price"
                label="VIP区票价(元)"
                rules={[{ required: true, message: '请输入票价' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="a_seats"
                label="A区座位数"
                rules={[{ required: true, message: '请输入座位数' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="a_price"
                label="A区票价(元)"
                rules={[{ required: true, message: '请输入票价' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="b_seats"
                label="B区座位数"
                rules={[{ required: true, message: '请输入座位数' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="b_price"
                label="B区票价(元)"
                rules={[{ required: true, message: '请输入票价' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="c_seats"
                label="C区座位数"
                rules={[{ required: true, message: '请输入座位数' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="c_price"
                label="C区票价(元)"
                rules={[{ required: true, message: '请输入票价' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setTemplateModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Theaters;
