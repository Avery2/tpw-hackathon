import {mkdtemp,rm,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=await mkdtemp(path.join(tmpdir(),'tpw-app-'));
try {
  // Publish the application only. Keep the old public website in source/archive,
  // but exclude its pages, member portal and server secrets.
  const browserFiles=source=>!source.includes('__pycache__') && (!path.extname(source)||['.html','.js','.css'].includes(path.extname(source)));
  await cp('dashboard',path.join(temp,'dashboard'),{recursive:true,filter:browserFiles});
  await cp('form-demo',path.join(temp,'form-demo'),{recursive:true,filter:browserFiles});
  for(const directory of ['assets/fonts','assets/img'])await cp(directory,path.join(temp,directory),{recursive:true});
  for (const directory of ['team-dashboard', 'team-form', 'intake']) {
    await cp(directory, path.join(temp, directory), {
      recursive: true,
      filter: source => browserFiles(source) && !source.split(path.sep).some(part => ['test', 'receiver', 'backend.js', 'sheets.js', 'raw-data.html'].includes(part))
    });
  }
  for (const file of ['neon-api.js', 'team-submissions.js', 'dashboard-source.js', 'dashboard-exports.js', 'dashboard-exports.css',
    'site-shell.js', 'site-shell.css', 'member-session.js', 'account-drawer.js', 'account-drawer.css',
    'neon-config.js', 'neon-auth-client.js', 'neon-demo-client.js']) {
    await cp(path.join('assets', file), path.join(temp, 'assets', file));
  }
  await cp('report', path.join(temp, 'report'), { recursive: true, filter: source => !path.extname(source) || path.extname(source) === '.pdf' });
  await mkdir(path.join(temp,'data/public'),{recursive:true});
  await cp('data/public/tpw-members.csv',path.join(temp,'data/public/tpw-members.csv'));
  await cp('standalone/index.html',path.join(temp,'index.html'));
  await cp('.nojekyll',path.join(temp,'.nojekyll'));
  await rm('dist',{recursive:true,force:true});await cp(temp,'dist',{recursive:true});
  for(const file of ['server/api.js','server/local.js','dashboard/js/layout.js'])execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
  console.log('Build passed: standalone dashboard, submission form and Neon API. Public website excluded.');
}finally{await rm(temp,{recursive:true,force:true});}
