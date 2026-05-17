# eJasa website
Platform demo siap jalan: layanan **On-site** (cleaning, cuci AC, dsb) + **Digital** (website, UI/UX, aplikasi, game, 3D) dengan:
- Registrasi Worker On-site
- Registrasi Worker Digital
- Marketplace + filter
- Order & Pembayaran **Simulasi Escrow**
- On-site: check-in/out GPS + foto/video bukti
- Digital: milestones 30/40/30 (submit → approve → release simulasi)
- Admin: verifikasi dokumen & sertifikat, interview, incidents, release/freeze
- Review & rating (skema tersedia)

## Cara Menjalankan
1. Install Node.js 18+
2. Di terminal:
```bash
npm install
npm run seed
npm start
```
3. Buka http://localhost:3000

### Akun Demo
- Admin: admin@demo.local / admin123
- Customer: budi@demo.local / demo123
- Worker On-site (Verified + Body Cam): siti@demo.local / demo123
- Worker Digital (Certified): rafi@demo.local / demo123

## Catatan
- Ini **demo** (bukan produksi). Session pakai memory. eKYC & Payment disimulasikan.
