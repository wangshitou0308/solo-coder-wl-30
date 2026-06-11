import React, { useState, useEffect } from 'react';
import { Form, Select, DatePicker, TimePicker, Button, Card, Alert, message, Space, Typography, Row, Col } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { performanceAPI, theaterAPI, showAPI } from '../../services/api';

const { Title } = Typography;
const { Option } = Select;

const ShowForm = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [theaters, setTheaters] = useState([]);
  const [performances, setPerformances] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [conflict, setConflict] = useState(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  const performanceIdFromUrl = searchParams.get('performanceId');

  useEffect(() => {
    fetchTheaters();
    fetchPerformances();
    if (performanceIdFromUrl) {
      form.setFieldsValue({ performanceId: parseInt(performanceIdFromUrl) });
    }
  }, [performanceIdFromUrl]);

  const theaterId = Form.useWatch('theaterId', form);

  useEffect(() => {
    if (theaterId) {
      fetchTemplates(theaterId);
    } else {
      setTemplates([]);
      form.setFieldsValue({ seatTemplateId: undefined });
    }
  }, [theaterId]);

  const fetchTheaters = async () => {
    try {
      const response = await theaterAPI.listTheaters();
      setTheaters(response.data.theaters || response.data || []);
    } catch (err) {
      message.error('获取剧场列表失败');
    }
  };

  const fetchPerformances = async () => {
    try {
      const response = await performanceAPI.list({ status: 'approved' });
      setPerformances(response.data.performances || response.data || []);
    } catch (err) {
      message.error('获取演出项目列表失败');
    }
  };

  const fetchTemplates = async (theaterId) => {
    try {
      const response = await theaterAPI.listTemplates({ theaterId });
      setTemplates(response.data.templates || response.data || []);
    } catch (err) {
      message.error('获取座位模板列表失败');
    }
  };

  const checkConflict = async (values) => {
    const { theaterId, performanceId, showDate, startTime, endTime } = values;
    
    if (!theaterId || !performanceId || !showDate || !startTime || !endTime) {
      setConflict(null);
      return;
    }

    setCheckingConflict(true);
    try {
      const params = {
        theaterId,
        performanceId,
        showDate: dayjs(showDate).format('YYYY-MM-DD'),
        startTime: dayjs(startTime).format('HH:mm'),
        endTime: dayjs(endTime).format('HH:mm'),
      };

      const response = await showAPI.checkConflict(params);
      setConflict(response.data);
    } catch (err) {
      console.error('档期冲突检测失败:', err);
    } finally {
      setCheckingConflict(false);
    }
  };

  const handleValuesChange = (_, allValues) => {
    checkConflict(allValues);
  };

  const handleSubmit = async (values) => {
    if (conflict?.hasConflict) {
      message.error('存在档期冲突，请调整时间');
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...values,
        showDate: dayjs(values.showDate).format('YYYY-MM-DD'),
        startTime: dayjs(values.startTime).format('HH:mm'),
        endTime: dayjs(values.endTime).format('HH:mm'),
      };

      await showAPI.create(submitData);
      message.success('创建成功');
      navigate('/shows');
    } catch (err) {
      message.error(err.response?.data?.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/shows');
  };

  const disabledDate = (current) => {
    return current && current < dayjs().startOf('day');
  };

  const theaterLayoutMap = {
    proscenium: '镜框式',
    thrust: '三面台',
    blackbox: '黑匣子',
  };

  return (
    <Card>
      <Title level={4} style={{ marginBottom: 24 }}>
        新增场次
      </Title>

      {conflict?.hasConflict && (
        <Alert
          type="warning"
          showIcon
          message="档期冲突警告"
          description={`${conflict.theaterConflict ? '剧场档期冲突' : ''}${conflict.theaterConflict && conflict.groupConflict ? '、' : ''}${conflict.groupConflict ? '演出团体档期冲突' : ''}`}
          style={{ marginBottom: 24 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={handleValuesChange}
      >
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="performanceId"
              label="演出项目"
              rules={[{ required: true, message: '请选择演出项目' }]}
            >
              <Select
                placeholder="请选择演出项目"
                showSearch
                optionFilterProp="children"
                loading={performances.length === 0}
              >
                {performances.map((performance) => (
                  <Option key={performance.id} value={performance.id}>
                    {performance.name} - {performance.type}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="theaterId"
              label="剧场"
              rules={[{ required: true, message: '请选择剧场' }]}
            >
              <Select
                placeholder="请选择剧场"
                showSearch
                optionFilterProp="children"
                loading={theaters.length === 0}
              >
                {theaters.map((theater) => (
                  <Option key={theater.id} value={theater.id}>
                    {theater.name}（{theaterLayoutMap[theater.layoutType] || theater.layoutType}，{theater.totalSeats}座）
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="seatTemplateId"
              label="座位模板"
              rules={[{ required: true, message: '请选择座位模板' }]}
            >
              <Select
                placeholder="请先选择剧场"
                showSearch
                optionFilterProp="children"
                disabled={!theaterId}
                loading={theaterId && templates.length === 0}
              >
                {templates.map((template) => (
                  <Option key={template.id} value={template.id}>
                    {template.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="showDate"
              label="演出日期"
              rules={[{ required: true, message: '请选择演出日期' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="请选择演出日期"
                disabledDate={disabledDate}
                format="YYYY-MM-DD"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="startTime"
              label="开始时间"
              rules={[{ required: true, message: '请选择开始时间' }]}
            >
              <TimePicker
                style={{ width: '100%' }}
                placeholder="请选择开始时间"
                format="HH:mm"
                minuteStep={5}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="endTime"
              label="结束时间"
              rules={[{ required: true, message: '请选择结束时间' }]}
            >
              <TimePicker
                style={{ width: '100%' }}
                placeholder="请选择结束时间"
                format="HH:mm"
                minuteStep={5}
              />
            </Form.Item>
          </Col>
        </Row>

        {checkingConflict && (
          <div style={{ marginBottom: 24, color: '#1890ff' }}>
            正在检测档期冲突...
          </div>
        )}

        <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
          <Space>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              disabled={conflict?.hasConflict}
            >
              创建场次
            </Button>
            <Button onClick={handleBack}>
              返回列表
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ShowForm;
