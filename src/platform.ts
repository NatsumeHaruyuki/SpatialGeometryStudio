const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const platform = /Macintosh|Mac OS X/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : 'Windows';

export const platformVersion = `${platform} v0.2`;
