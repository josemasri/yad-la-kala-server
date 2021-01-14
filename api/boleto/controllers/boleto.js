const { default: axios } = require("axios");
const { parseMultipartData, sanitizeEntity } = require("strapi-utils");
const boletoMailHtml = require("../../../helpers/boletoMailHtml");
const paqueteMailHtml = require("../../../helpers/paqueteMailHtml");
const mercadopago = require("mercadopago");
mercadopago.configurations.setAccessToken(process.env.MERCADOPAGO_SECRET);

const validarPago = async (rifaData, idOrden, cantidadBoletos) => {
  try {
    // Login a paypal
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    const res = await axios.post(
      `${process.env.PAYPAL_API}/v1/oauth2/token`,
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        auth: {
          username: process.env.PAYPAL_USER,
          password: process.env.PAYPAL_PASSWORD,
        },
      }
    );
    const token = res.data.access_token;

    const { data: orderResData } = await axios.get(
      `${process.env.PAYPAL_API}/v2/checkout/orders/${idOrden}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return (
      parseFloat(orderResData.purchase_units[0].amount.value) >=
      cantidadBoletos * rifaData.precio
    );
  } catch (error) {
    console.log(error);
    throw new Error("Ha ocurrido un error al validar el pago");
  }
};

const validarPagoPaquete = async (paqueteData, idOrden) => {
  try {
    // Login a paypal
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    const res = await axios.post(
      `${process.env.PAYPAL_API}/v1/oauth2/token`,
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        auth: {
          username: process.env.PAYPAL_USER,
          password: process.env.PAYPAL_PASSWORD,
        },
      }
    );
    const token = res.data.access_token;

    const { data: orderResData } = await axios.get(
      `${process.env.PAYPAL_API}/v2/checkout/orders/${idOrden}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return (
      parseFloat(orderResData.purchase_units[0].amount.value) >=
      paqueteData.precio
    );
  } catch (error) {
    console.log(error);
    throw new Error("Ha ocurrido un error al validar el pago");
  }
};

module.exports = {
  /**
   * Create a record.
   *
   * @return {Object}
   */

  async comprarPaqueteBoletos(ctx) {
    const { paquete, boletos } = ctx.request.body;
    const paqueteData = await strapi.services["paquete-boletos"].findOne({
      id: paquete,
    });

    const isPaymentValid = validarPagoPaquete(
      paqueteData,
      ctx.request.body.orderId
    );

    if (!isPaymentValid) {
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }

    // Crear boletos
    const boletosNuevos = [];
    const paqueteMail = [];

    for (let i = 0; i < boletos.length; i++) {
      // Creando Boletos
      const boletoNuevo = await strapi.services["boleto"].create({
        ...ctx.request.body,
        rifa: boletos[i].rifa,
        numero: boletos[i].boleto,
      });

      boletosNuevos.push(boletoNuevo);
      const rifaData = await strapi.services.rifa.findOne({
        id: boletos[i].rifa,
      });
      // TODO: RIFA
      paqueteMail.push({ ...rifaData, numero: boletos[i].boleto });
    }

    // crear boletos Hot pot
    for (let i = 0; i < paqueteData.boletosHotPot; i++) {
      const hotPot = await strapi.services["hot-pot"].find();
      // Actualizar el siguiente disponible
      await strapi.services["hot-pot"].update(
        { id: hotPot[0].id },
        { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
      );
      ctx.request.body.numero = hotPot[0].siguienteDisponible;
      // Validate paypal
      entity = await strapi.services["boletos-hot-pot"].create(
        ctx.request.body
      );
      paqueteMail.push({
        nombre: "JackPot",
        numero: hotPot[0].siguienteDisponible,
      });
    }

    try {
      // Agregar paquete boletos vendido
      await strapi.services["venta-paquete"].create({
        ...ctx.request.body,
        boletos: boletosNuevos.map((boleto) => boleto.id),
        paquetes_de_boleto: paqueteData.id,
      });
    } catch (error) {
      console.log(error);
    }

    // Enviar correo
    const emailTemplate = {
      subject: "Gracias por tu Donativo",
      text: `Gracias <%= entity.nombre %> por tu donativo, 
        Rifa: <%= paquete.nombre %>
        Donativo: <%= paquete.precio %>
        
        Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
      `,
      html: paqueteMailHtml(paqueteMail),
    };
    // Enviar mail de boletos
    await strapi.plugins["email"].services.email.sendTemplatedEmail(
      {
        from: "Yad La Kala",
        to: ctx.request.body.mail,
      },
      emailTemplate,
      {
        entity: { ...ctx.request.body, ...paqueteMail },
        paquete,
      }
    );

    // TODO: Enviar mail de boletos
    return { ok: true, message: "Paquete comprado con éxito" };
  },

  /**
   * Create a record.
   *
   * @return {Object}
   */

  async comprarPaqueteBoletosUsuario(ctx) {
    const { paquete, boletos, usuario, password } = ctx.request.body;
    const paqueteData = await strapi.services["paquete-boletos"].findOne({
      id: paquete,
    });

    // Validar Usuario y password
    const usuarioEncontrado = await strapi.services["voluntaria"].findOne({
      usuario,
      password,
    });

    if (!usuarioEncontrado) {
      return ctx.throw(401, "Usuario y/o Contraseña incorrecta");
    }

    // Agregar adeudo a voluntaria
    await strapi.services["voluntaria"].update(
      {
        id: usuarioEncontrado.id,
      },
      {
        cantidadVendida: usuarioEncontrado.cantidadVendida + paqueteData.precio,
      }
    );

    // Crear boletos
    const boletosNuevos = [];
    const paqueteMail = [];
    for (let i = 0; i < boletos.length; i++) {
      const boletoNuevo = await strapi.services["boleto"].create({
        ...ctx.request.body,
        rifa: boletos[i].rifa,
        numero: boletos[i].boleto,
      });
      boletosNuevos.push(boletoNuevo);
      const rifaData = await strapi.services.rifa.findOne({
        id: boletos[i].rifa,
      });
      // TODO: RIFA
      paqueteMail.push({ ...rifaData, numero: boletos[i].boleto });
    }

    // crear boletos Hot pot
    for (let i = 0; i < paqueteData.boletosHotPot; i++) {
      try {
        const hotPot = await strapi.services["hot-pot"].find();
        // Actualizar el siguiente disponible
        await strapi.services["hot-pot"].update(
          { id: hotPot[0].id },
          { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
        );

        const boletoHotPot = await strapi.services["boletos-hot-pot"].create(
          ctx.request.body
        );
        paqueteMail.push({
          nombre: "Jack Pot",
          numero: hotPot[0].siguienteDisponible,
        });
      } catch (error) {
        console.log(error);
      }
    }

    // Agregar paquete boletos vendido
    await strapi.services["venta-paquete"].create({
      ...ctx.request.body,
      boletos: boletosNuevos.map((boleto) => boleto.id),
      paquetes_de_boleto: paqueteData.id,
    });

    // Agregar venta efectivo
    await strapi.services["venta-efectivo"].create({
      ...ctx.request.body,
      cantidad: paqueteData.precio,
      boletos: boletosNuevos.map((boleto) => boleto.id),
      voluntaria: usuarioEncontrado.id,
    });

    // Enviar correo
    const emailTemplate = {
      subject: "Gracias por tu Donativo",
      text: `Gracias <%= entity.nombre %> por tu donativo, 
        Rifa: <%= paquete.nombre %>
        Donativo: <%= paquete.precio %>
        
        Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
      `,
      html: paqueteMailHtml(paqueteMail),
    };
    // Enviar mail de boletos
    await strapi.plugins["email"].services.email.sendTemplatedEmail(
      {
        from: "Yad La Kala",
        to: ctx.request.body.mail,
      },
      emailTemplate,
      {
        entity: { ...ctx.request.body, ...paqueteMail },
        paquete,
      }
    );

    return { ok: true, message: "Paquete comprado con éxito" };
  },

  /**
   * Create a record.
   *
   * @return {Object}
   */

  async create(ctx) {
    const { body } = ctx.request;
    const { numerosSeleccionados, rifa } = body;
    // Obtener precio del boleto de la rifa
    const rifaData = await strapi.services.rifa.findOne({
      id: rifa,
    });
    // TODO: Validar pago
    const isPaymentValid = await validarPago(
      rifaData,
      body.order.id,
      numerosSeleccionados.length
    );
    if (!isPaymentValid) {
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }

    // Crear Boletos
    const boletos = [];
    for (let i = 0; i < numerosSeleccionados.length; i++) {
      const entity = await strapi.services.boleto.create({
        ...ctx.request.body,
        orderId: body.order.id,
        numero: numerosSeleccionados[i],
      });
      boletos.push(entity);
    }
    const emailTemplate = {
      subject: "Gracias por tu Donativo",
      text: `Gracias <%= entity.nombre %> por tu donativo, 
        Rifa: <%= rifa.precio %>
        Boleto: <%= entity.numero %>
        Donativo: <%= rifa.precio %>
        
        Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
      `,
      html: boletoMailHtml(numerosSeleccionados),
    };
    // Enviar mail de boletos
    await strapi.plugins["email"].services.email.sendTemplatedEmail(
      {
        from: "Yad La Kala",
        to: ctx.request.body.mail,
      },
      emailTemplate,
      {
        rifa: rifaData,
        entity: boletos[0],
      }
    );
    return boletos;
  },
  async createConUsuario(ctx) {
    const { body } = ctx.request;
    const { numerosSeleccionados, rifa } = body;
    const { usuario, password } = body;

    // Obtener precio del boleto de la rifa
    const rifaData = await strapi.services.rifa.findOne({
      id: rifa,
    });

    // Validar Usuario y password
    const usuarioEncontrado = await strapi.services["voluntaria"].findOne({
      usuario,
      password,
    });

    if (!usuarioEncontrado) {
      return ctx.throw(401, "Usuario y/o Contraseña incorrecta");
    }

    // Agregar adeudo a voluntaria
    await strapi.services["voluntaria"].update(
      {
        id: usuarioEncontrado.id,
      },
      {
        cantidadVendida:
          usuarioEncontrado.cantidadVendida +
          rifaData.precio * numerosSeleccionados.length,
      }
    );

    // Crear Boletos
    const boletos = [];
    for (let i = 0; i < numerosSeleccionados.length; i++) {
      const entity = await strapi.services.boleto.create({
        ...ctx.request.body,
        metodoPago: "Efectivo",
        voluntaria: usuarioEncontrado.id,
        numero: numerosSeleccionados[i],
      });
      boletos.push(entity);
    }

    // Agregar venta efectivo

    await strapi.services["venta-efectivo"].create({
      ...ctx.request.body,
      cantidad:
        usuarioEncontrado.cantidadVendida +
        rifaData.precio * numerosSeleccionados.length,
      boletos: boletos.map((boleto) => boleto.id),
      voluntaria: usuarioEncontrado.id,
    });

    const emailTemplate = {
      subject: "Gracias por tu Donativo",
      text: `Gracias <%= entity.nombre %> por tu donativo, 
        Rifa: <%= rifa.precio %>
        Boleto: <%= entity.numero %>
        Donativo: <%= rifa.precio %>
        
        Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
      `,
      html: boletoMailHtml(numerosSeleccionados),
    };
    // Enviar mail de boletos
    await strapi.plugins["email"].services.email.sendTemplatedEmail(
      {
        from: "Yad La Kala",
        to: ctx.request.body.mail,
      },
      emailTemplate,
      {
        rifa: rifaData,
        entity: boletos[0],
      }
    );
    return "ok";
  },

  async generarPreferenciaMP(ctx) {
    const { body } = ctx.request;

    // Crea un objeto de preferencia
    let preference = {
      items: [
        {
          title: "Boleto Rifa",
          unit_price: body.precio,
          quantity: 1,
        },
      ],
    };

    try {
      const res = await mercadopago.preferences.create(preference);
      return res.body.id;
    } catch (error) {
      console.log(error);
      return ctx.throw(401, "Usuario y/o Contraseña incorrecta");
    }
  },
};
