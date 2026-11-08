// The docs come in two flavours with an address each, so a link (or an agent reading the page)
// lands on the right one: the web at /, React Native at /react-native/.

export type Platform = 'web' | 'native';

export const PLATFORMS: Record<Platform, { label: string; path: string; title: string }> = {
  web: {
    label: 'Web',
    path: '/',
    title: 'pagecurl · Realistic page curl and page flip for any HTML',
  },
  native: {
    label: 'React Native',
    path: '/react-native/',
    title: 'pagecurl for React Native · Realistic page curl for iOS and Android',
  },
};

export function platformOf(pathname: string): Platform {
  return pathname.replace(/\/+$/, '').endsWith('/react-native') ? 'native' : 'web';
}
