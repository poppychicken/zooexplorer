import { Typography, Card, Tag, Space } from 'antd';
import {
  CheckCircleFilled,
  GithubOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useCurrentUser } from '../api/me';

const { Title, Paragraph, Text } = Typography;

// Polished "first deploy" landing page. Designed to look like a real
// product shell from the moment the pod boots — so the team showing
// off `selfserve create` doesn't have to apologise for boilerplate
// during a demo.
//
// Devs are expected to replace this page entirely once they start
// building their actual feature. The Items page is still here as a
// working CRUD reference.
export default function DashboardPage() {
  const { user } = useCurrentUser();
  const firstName = user?.preferred_username
    || user?.email?.split('@')[0]?.split('.')[0]
    || null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Tag color="green" icon={<CheckCircleFilled />} className="mb-3">
          Deployment healthy
        </Tag>
        <Title level={2} className="mb-1">
          {firstName ? `Welcome, ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}.` : 'Welcome.'}
        </Title>
        <Paragraph type="secondary" className="mb-0 text-base">
          Your app <Text strong>{'{{PROJECT_NAME}}'}</Text> is live. Below is the platform plumbing already wired up
          — start editing <code>frontend/src/pages/DashboardPage.jsx</code> to make this page your own.
        </Paragraph>
      </div>

      <Card className="mb-4">
        <Title level={5} className="mb-4">{"What's already running"}</Title>
        <Space direction="vertical" size={12} className="w-full">
          <PlatformRow
            icon={<SafetyCertificateOutlined className="text-blue-500" />}
            title="SSO via Google"
            detail="Every request reaches your code already-authenticated. Identity is on req headers (X-Auth-Request-Email / -User)."
          />
          <PlatformRow
            icon={<DatabaseOutlined className="text-emerald-500" />}
            title="MongoDB, per-pod dynamic creds"
            detail="$MONGODB_URI is injected at boot. OpenBao rotates the user every 20 min. No setup needed."
          />
          <PlatformRow
            icon={<CloudServerOutlined className="text-violet-500" />}
            title="ArgoCD-managed deploy"
            detail="Push to main → CI builds → bump PR opens on platform-gitops-github → DevOps merges → pod rolls."
          />
          <PlatformRow
            icon={<GithubOutlined />}
            title="Your repo"
            detail={(
              <>
                <code>swipejobs/{'{{PROJECT_NAME}}'}</code> — seeded from{' '}
                <code>fastapi-react-template</code>, branch <code>main</code>.
              </>
            )}
          />
        </Space>
      </Card>

      <Card size="small" className="bg-slate-50 border-slate-200">
        <Text type="secondary">
          Replace this page with your own UI. See <code>frontend/src/pages/ItemsPage.jsx</code> for a working
          CRUD example, and <code>backend/app/api/items.py</code> for the matching API.
        </Text>
      </Card>
    </div>
  );
}

function PlatformRow({ icon, title, detail }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-xl mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-gray-500">{detail}</div>
      </div>
    </div>
  );
}
