import NotificationLogViewer from '@/components/admin/NotificationLogViewer';

export default function AdminNotifications() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Admin: Notification Logs</h1>
      <NotificationLogViewer />
    </div>
  );
}
