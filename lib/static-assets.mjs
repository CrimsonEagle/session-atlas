const fixedAssets={
 '/':['index.html','text/html; charset=utf-8'],
 '/style.css':['style.css','text/css; charset=utf-8'],
 '/details.css':['details.css','text/css; charset=utf-8'],
 '/background.css':['background.css','text/css; charset=utf-8'],
 '/app-icon.png':['app-icon.png','image/png'],
 '/favicon.png':['favicon.png','image/png'],
 '/favicon.svg':['favicon.svg','image/svg+xml']
};

const javascriptPath=/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:js|mjs)$/;

export function staticAsset(pathname){
 if(Object.hasOwn(fixedAssets,pathname))return fixedAssets[pathname];
 if(javascriptPath.test(pathname))return [pathname.slice(1),'text/javascript; charset=utf-8'];
 return null;
}
