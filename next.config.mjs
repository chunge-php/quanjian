/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Windows + Node 22/24 上 next build 的静态生成子进程会以 3221226505 崩溃，
  // 单进程生成可以绕开（只影响构建速度，不影响产物）；Linux/CI 不受影响。
  experimental: process.platform === 'win32' ? { cpus: 1, workerThreads: false } : {},
}
export default nextConfig
