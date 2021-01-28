"use strict";

const { default: axios } = require("axios");
const boletoMailHtml = require("../../../helpers/boletoMailHtml");
const stripe = require("stripe")(process.env.STRIPE_API);

/**
 * Read the documentation (https://strapi.io/documentation/v3.x/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

const validarPago = async (idOrden) => {
  try {
    // Login a paypal
    const paymentIntent = await stripe.paymentIntents.retrieve(idOrden);
    console.log(paymentIntent);
    return paymentIntent.amount / 100 >= 500;
  } catch (error) {
    console.log(error);
    throw new Error("Ha ocurrido un error al validar el pago");
  }
};

const validarPagoPaypal = async (idOrden) => {
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
    return parseFloat(orderResData.purchase_units[0].amount.value) >= 500;
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

  async create(ctx) {
    let entity;
    const body = ctx.request.body;

    try {
      const isValid = await validarPago(body.orderId);

      if (!isValid) {
        return ctx.throw(
          400,
          "No se pudo completar el pago, intentalo de nuevo"
        );
      }

      // Obtener número de hotPot
      const hotPot = await strapi.services["hot-pot"].find({ _limit: -1 });
      // Actualizar el siguiente disponible
      await strapi.services["hot-pot"].update(
        { id: hotPot[0].id },
        { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
      );
      body.numero = hotPot[0].siguienteDisponible;
      // Validate paypal
      entity = await strapi.services["boletos-hot-pot"].create(body);

      // Enviar correo
      const emailTemplate = {
        subject: "Gracias por tu Donativo",
        text: `Gracias <%= entity.nombre %> por tu donativo, 
          Rifa: <%= rifa.nombre %>
          Boleto: <%= entity.numero %>
          Donativo: <%= rifa.precio %>
          
          Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
        `,
        html: boletoMailHtml([hotPot[0].siguienteDisponible]),
      };
      // Enviar mail de boletos
      await strapi.plugins["email"].services.email.sendTemplatedEmail(
        {
          from: "Yad La Kala",
          to: ctx.request.body.mail,
        },
        emailTemplate,
        {
          rifa: {
            nombre: "Jack Pot",
            precio: 500,
            imagen:
              "https://imagenes-yad.s3.us-east-2.amazonaws.com/hot-pot.png",
          },
          entity,
        }
      );

      return entity;
    } catch (error) {
      console.log(error);
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }
  },

  async createPayPal(ctx) {
    let entity;
    const body = ctx.request.body;

    try {
      const isValid = await validarPago(body.orderId);

      if (!isValid) {
        return ctx.throw(
          400,
          "No se pudo completar el pago, intentalo de nuevo"
        );
      }

      // Obtener número de hotPot
      const hotPot = await strapi.services["hot-pot"].find({ _limit: -1 });
      // Actualizar el siguiente disponible
      await strapi.services["hot-pot"].update(
        { id: hotPot[0].id },
        { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
      );
      body.numero = hotPot[0].siguienteDisponible;
      // Validate paypal
      entity = await strapi.services["boletos-hot-pot"].create(body);

      // Enviar correo
      const emailTemplate = {
        subject: "Gracias por tu Donativo",
        text: `Gracias <%= entity.nombre %> por tu donativo, 
          Rifa: <%= rifa.nombre %>
          Boleto: <%= entity.numero %>
          Donativo: <%= rifa.precio %>
          
          Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
        `,
        html: boletoMailHtml([hotPot[0].siguienteDisponible]),
      };
      // Enviar mail de boletos
      await strapi.plugins["email"].services.email.sendTemplatedEmail(
        {
          from: "Yad La Kala",
          to: ctx.request.body.mail,
        },
        emailTemplate,
        {
          rifa: {
            nombre: "Jack Pot",
            precio: 500,
            imagen:
              "https://imagenes-yad.s3.us-east-2.amazonaws.com/hot-pot.png",
          },
          entity,
        }
      );

      return entity;
    } catch (error) {
      console.log(error);
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }
  },

  async createConUsuario(ctx) {
    const body = ctx.request.body;

    // Validar Usuario y password
    const usuarioEncontrado = await strapi.services["voluntaria"].findOne({
      usuario: body.usuario,
      password: body.password,
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
        cantidadVendida: usuarioEncontrado.cantidadVendida + 500,
      }
    );

    try {
      // Obtener número de hotPot
      const hotPot = await strapi.services["hot-pot"].find({ _limit: -1 });
      // Actualizar el siguiente disponible
      await strapi.services["hot-pot"].update(
        { id: hotPot[0].id },
        { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
      );
      body.numero = hotPot[0].siguienteDisponible;
      // Validate paypal
      const entity = await strapi.services["boletos-hot-pot"].create(body);

      // Enviar correo
      const emailTemplate = {
        subject: "Gracias por tu Donativo",
        text: `Gracias <%= entity.nombre %> por tu donativo, 
          Rifa: <%= rifa.nombre %>
          Boleto: <%= entity.numero %>
          Donativo: <%= rifa.precio %>
          
          Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
        `,
        html: boletoMailHtml([hotPot[0].siguienteDisponible]),
      };
      // Enviar mail de boletos
      await strapi.plugins["email"].services.email.sendTemplatedEmail(
        {
          from: "Yad La Kala",
          to: ctx.request.body.mail,
        },
        emailTemplate,
        {
          rifa: {
            nombre: "Jack Pot",
            precio: 500,
            imagen:
              "https://imagenes-yad.s3.us-east-2.amazonaws.com/hot-pot.png",
          },
          entity,
        }
      );

      return "OK";
    } catch (error) {
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }
  },

  async createConDonativos(ctx) {
    const body = ctx.request.body;

    try {
      // Obtener número de hotPot
      const hotPot = await strapi.services["hot-pot"].find({ _limit: -1 });
      // Actualizar el siguiente disponible
      await strapi.services["hot-pot"].update(
        { id: hotPot[0].id },
        { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
      );
      body.numero = hotPot[0].siguienteDisponible;
      // Validate paypal
      const entity = await strapi.services["boletos-hot-pot"].create({
        ...body,
        metodoPago: "Donativos Inteligentes",
      });

      // Enviar correo
      const emailTemplate = {
        subject: "Gracias por tu Donativo",
        text: `Gracias <%= entity.nombre %> por tu donativo, 
          Rifa: <%= rifa.nombre %>
          Boleto: <%= entity.numero %>
          Donativo: <%= rifa.precio %>
          
          Con tu ayuda estas cumpliendo los sueños de muchas novias de la comunidad
        `,
        html: boletoMailHtml([hotPot[0].siguienteDisponible]),
      };

      // Crear Donativos Inteligentes
    await strapi.services["donativos-inteligentes"].create({
      boletos: [entity.id],
      precio: 500,
    });

      // Enviar mail de boletos
      await strapi.plugins["email"].services.email.sendTemplatedEmail(
        {
          from: "Yad La Kala",
          to: "yadlakalah@gmail.com",
          cc: "alicesrougo@gmail.com",
        },
        emailTemplate,
        {
          rifa: {
            nombre: "Jack Pot",
            precio: 500,
            imagen:
              "https://imagenes-yad.s3.us-east-2.amazonaws.com/hot-pot.png",
          },
          entity,
        }
      );

      return "OK";
    } catch (error) {
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }
  },
};
