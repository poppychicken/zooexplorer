import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getItems, createItem, updateItem, deleteItem } from '../api/items';

const { Title } = Typography;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export default function ItemsPage() {
  // App.useApp() instead of the static antd `message` export: the static
  // one renders outside the ConfigProvider tree and loses the theme.
  const { message } = App.useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // null = closed, {} = new
  const [form] = Form.useForm();

  const [reloadKey, setReloadKey] = useState(0);

  // Bumping the key re-runs the effect below. setLoading lives here rather
  // than in the effect body: a synchronous setState inside an effect
  // triggers a cascading render (react-hooks/set-state-in-effect).
  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getItems()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((error) => {
        if (!cancelled) message.error(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, message]);

  const openModal = (item = null) => {
    setEditing(item ?? {});
    form.setFieldsValue({
      name: item?.name ?? '',
      description: item?.description ?? '',
      status: item?.status ?? 'active',
      tags: item?.tags ?? [],
    });
  };

  const closeModal = () => {
    setEditing(null);
    form.resetFields();
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return; // form shows the field errors itself
    }

    setSaving(true);
    try {
      if (editing?.id) {
        await updateItem(editing.id, values);
        message.success('Item updated');
      } else {
        await createItem(values);
        message.success('Item created');
      }
      closeModal();
      reload();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteItem(id);
      message.success('Item deleted');
      reload();
    } catch (error) {
      message.error(error.message);
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text) => text || '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Tags',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags) => (
        <Space size="small" wrap>
          {(tags ?? []).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button
            icon={<EditOutlined />}
            size="small"
            aria-label={`Edit ${record.name}`}
            onClick={() => openModal(record)}
          />
          <Popconfirm
            title="Delete this item?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              icon={<DeleteOutlined />}
              danger
              size="small"
              aria-label={`Delete ${record.name}`}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <Title level={2}>Items</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          Add Item
        </Button>
      </div>

      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title={editing?.id ? 'Edit Item' : 'Add Item'}
        open={editing !== null}
        onCancel={closeModal}
        onOk={handleSave}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="Item name" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea placeholder="Optional description" rows={3} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="tags" label="Tags">
            <Select mode="tags" placeholder="Add tags" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
