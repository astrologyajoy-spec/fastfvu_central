const fs = require('fs');
let code = fs.readFileSync('src/components/UserDashboard.tsx', 'utf8');

const oldTr = `{logs.map((log, i) => (
                        <tr key={i} className={theme === 'dark' ? 'divide-slate-800' : 'divide-slate-200'}>
                          <td className={\`px-6 py-4 text-xs \${textMuted}\`}>{new Date(log.created_at || Date.now()).toLocaleString()}</td>
                          <td className="px-6 py-4 font-mono text-xs">{log.file_name}</td>
                          <td className="px-6 py-4 font-mono text-xs text-blue-500">{log.file_name.replace('.txt', '.fvu')}</td>
                          <td className="px-6 py-4">
                            <button className="flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          </td>
                        </tr>
                      ))}`;

const newTr = `{logs.map((log: any, i) => (
                        <tr key={i} className={theme === 'dark' ? 'divide-slate-800' : 'divide-slate-200'}>
                          <td className={\`px-6 py-4 text-xs \${textMuted}\`}>{new Date(log.created_at || Date.now()).toLocaleString()}</td>
                          <td className="px-6 py-4 font-mono text-xs">{log.file_name}</td>
                          <td className="px-6 py-4 font-mono text-xs text-blue-500">{log.output_filename || log.file_name.replace('.txt', '.fvu')}</td>
                          <td className="px-6 py-4">
                            {log.output_filename ? (
                              <a href={\`/api/v1/fvu/download/\${log.output_filename}\`} download className="inline-flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </a>
                            ) : (
                              <button disabled className="inline-flex items-center space-x-1 text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500 px-3 py-1.5 rounded-lg cursor-not-allowed">
                                <Download className="w-3.5 h-3.5" />
                                <span>Missing</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}`;

code = code.replace(oldTr, newTr);
fs.writeFileSync('src/components/UserDashboard.tsx', code);
console.log('UserDashboard updated');
