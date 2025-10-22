import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import { AddressInfo } from 'net';

// Mock download function for testing
async function downloadFile(url: string): Promise<Buffer> {
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
  const DOWNLOAD_TIMEOUT = 60000; // 60 seconds timeout
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : http;
    
    const timeoutId = setTimeout(() => {
      request.destroy();
      reject(new Error('Download timeout: file took too long to download'));
    }, DOWNLOAD_TIMEOUT);
    
    const request = protocol
      .get(url, (response: any) => {
        if (response.statusCode !== 200) {
          clearTimeout(timeoutId);
          reject(new Error(`Failed to download file: ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        
        response.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          
          if (totalSize > MAX_FILE_SIZE) {
            clearTimeout(timeoutId);
            request.destroy();
            reject(new Error(`File too large: exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`));
            return;
          }
          
          chunks.push(chunk);
        });
        
        response.on('end', () => {
          clearTimeout(timeoutId);
          resolve(Buffer.concat(chunks));
        });
        
        response.on('error', (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      })
      .on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

describe('downloadFile', () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (req.url === '/small-file') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(Buffer.from('test content'));
      } else if (req.url === '/large-file') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        // Simulate a file larger than 50MB
        const chunk = Buffer.alloc(1024 * 1024); // 1MB chunk
        for (let i = 0; i < 51; i++) {
          res.write(chunk);
        }
        res.end();
      } else if (req.url === '/slow-file') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        // Never send data to trigger timeout
      } else if (req.url === '/not-found') {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(0, () => {
      const address = server.address() as AddressInfo;
      serverUrl = `http://localhost:${address.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should successfully download a small file', async () => {
    const buffer = await downloadFile(`${serverUrl}/small-file`);
    expect(buffer.toString()).toBe('test content');
  });

  it('should reject files larger than 50MB', async () => {
    await expect(downloadFile(`${serverUrl}/large-file`))
      .rejects
      .toThrow('File too large: exceeds 50MB limit');
  }, 10000);

  it('should timeout on slow downloads', async () => {
    // Use a shorter timeout for testing
    const downloadWithShortTimeout = async (url: string): Promise<Buffer> => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      const DOWNLOAD_TIMEOUT = 1000; // 1 second for testing
      
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          request.destroy();
          reject(new Error('Download timeout: file took too long to download'));
        }, DOWNLOAD_TIMEOUT);
        
        const request = http.get(url, (response) => {
          if (response.statusCode !== 200) {
            clearTimeout(timeoutId);
            reject(new Error(`Failed to download file: ${response.statusCode}`));
            return;
          }

          const chunks: Buffer[] = [];
          let totalSize = 0;
          
          response.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            
            if (totalSize > MAX_FILE_SIZE) {
              clearTimeout(timeoutId);
              request.destroy();
              reject(new Error(`File too large: exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`));
              return;
            }
            
            chunks.push(chunk);
          });
          
          response.on('end', () => {
            clearTimeout(timeoutId);
            resolve(Buffer.concat(chunks));
          });
          
          response.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
        }).on('error', (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
    };

    await expect(downloadWithShortTimeout(`${serverUrl}/slow-file`))
      .rejects
      .toThrow('Download timeout: file took too long to download');
  }, 5000);

  it('should reject non-200 status codes', async () => {
    await expect(downloadFile(`${serverUrl}/not-found`))
      .rejects
      .toThrow('Failed to download file: 404');
  });
});
