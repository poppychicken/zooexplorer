import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const formatDate = (date) => {
  if (!date) return 'N/A';
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
};

export const formatDistanceToNow = (date) => {
  if (!date) return 'N/A';
  return dayjs(date).fromNow();
};
