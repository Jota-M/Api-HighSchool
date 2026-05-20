import express from 'express';

const router = express.Router();

const sendWhatsApp = async (phone, message) => {
  const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.EVOLUTION_INSTANCE_TOKEN
    },
    body: JSON.stringify({
      number: phone,
      text: message
    })
  });

  return response.json();
};

router.post('/test', async (req, res) => {

  try {

    // Primer número
    const response1 = await sendWhatsApp(
      '59177472094',
      'Hola Notificacion de prueba numero 1 desde el backend'
    );

    // Segundo número
    const response2 = await sendWhatsApp(
      '59167223896',
      'Hola Notificacion de prueba numero 2 desde el backend'
    );

    res.json({
      success: true,
      primerMensaje: response1,
      segundoMensaje: response2
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/grupos', async (req, res) => {
  try {

    const response = await fetch(
      `${process.env.EVOLUTION_API_URL}/group/list`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.EVOLUTION_INSTANCE_TOKEN
        }
      }
    );

    const text = await response.text();

    res.json({
      status: response.status,
      data: text
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
});

export default router;