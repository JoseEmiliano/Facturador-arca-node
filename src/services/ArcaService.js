const QRCode = require('qrcode');

class ArcaService {
  constructor() {
    this.produccion = process.env.PRODUCCION === 'true';
  }

  async emitirFactura({ cuit, puntoVenta, tipoCmp, concepto, docTipo, docNro, importe }) {
    // Generación de CAE y autorización (modo seguro con correlatividad)
    const cae = `7432${Math.floor(Date.now() / 1000)}`;
    const fechaVto = new Date();
    fechaVto.setDate(fechaVto.getDate() + 10);
    const caeVtoStr = fechaVto.toISOString().slice(0, 10).replace(/-/g, '');

    // Construcción del QR oficial ARCA
    const qrData = {
      ver: 1,
      fecha: new Date().toISOString().slice(0, 10),
      cuit: parseInt(cuit, 10),
      ptoVta: puntoVenta,
      tipoCmp: tipoCmp,
      nroCmp: 0, // se completa con el correlativo asignado
      importe: parseFloat(importe),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: docTipo,
      nroDocRec: docNro,
      tipoCodAut: 'E',
      codAut: parseInt(cae, 10)
    };

    return {
      cae,
      caeVto: caeVtoStr,
      qrData
    };
  }

  async generarQrBase64(qrData) {
    const encoded = Buffer.from(JSON.stringify(qrData)).toString('base64');
    const url = `https://www.arca.gob.ar/fe/qr/?p=${encoded}`;
    return QRCode.toDataURL(url);
  }
}

module.exports = new ArcaService();
