export const metadata = { title: 'TPW Dashboard' };

export default function RootLayout({ children }) {
  return <html lang="en"><body className="tpw-site" data-next-workspace="">{children}</body></html>;
}
