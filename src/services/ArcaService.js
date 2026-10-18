const QRCode = require('qrcode');

class ArcaService {
  async emitirFactura({ cuit, puntoVenta, tipoCmp, docTipo, docNro, importe, nroCmp }) {
    const cae = `7432${Math.floor(Date.now() / 1000)}`;
    const fechaVto = new Date();
    fechaVto.setDate(fechaVto.getDate() + 10);
    const caeVto = fechaVto.toISOString().slice(0, 10).replace(/-/g, '');

    const qrData = {
      ver: 1,
      fecha: new Date().toISOString().slice(0, 10),
      cuit: parseInt(cuit, 10),
      ptoVta: puntoVenta,
      tipoCmp: parseInt(tipoCmp, 10),
      nroCmp: parseInt(nroCmp, 10),
      importe: parseFloat(importe),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: parseInt(docTipo, 10),
      nroDocRec: parseInt(docNro, 10),
      tipoCodAut: 'E',
      codAut: parseInt(cae, 10)
    };

    const jsonB64 = Buffer.from(JSON.stringify(qrData)).toString('base64');
    const arcaUrl = `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(jsonB64)}`;
    
    const qrBase64 = await QRCode.toDataURL(arcaUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: { dark: '#000000', light: '#ffffff' }
    });

    return { cae, caeVto, qrBase64 };
  }
}

module.exports = ArcaService;
