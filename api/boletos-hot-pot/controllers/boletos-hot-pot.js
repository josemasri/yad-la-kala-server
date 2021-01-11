"use strict";

/**
 * Read the documentation (https://strapi.io/documentation/v3.x/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

const validarPago = async (idOrden) => {
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
          username:
            "AdhmmWk2-3UlbPxWjENeeFQ-N3wKAKSY8d77wwTeiV-ACFZYgj5gJPKhlFbrox674nZMN0JEQFxP1gVD",
          password:
            "EMEB4iTSILNXlycGyk7BJKtQ6iB6z5I-k9VdyrsQP2AkkJJhInXlg6LbU7-TgOXL1kOjg1qC5beA3Wnn",
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
      validarPago(body.orderId);

      // Obtener número de hotPot
      const hotPot = await strapi.services["hot-pot"].find();
      // Actualizar el siguiente disponible
      await strapi.services["hot-pot"].update(
        { id: hotPot[0].id },
        { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
      );
      body.numero = hotPot[0].siguienteDisponible;
      // Validate paypal
      entity = await strapi.services["boletos-hot-pot"].create(body);
      return entity;
    } catch (error) {
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }
  },

  async createConUsuario(ctx) {
    let entity;
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
      const hotPot = await strapi.services["hot-pot"].find();
      // Actualizar el siguiente disponible
      await strapi.services["hot-pot"].update(
        { id: hotPot[0].id },
        { siguienteDisponible: hotPot[0].siguienteDisponible + 1 }
      );
      body.numero = hotPot[0].siguienteDisponible;
      // Validate paypal
      entity = await strapi.services["boletos-hot-pot"].create(body);
      return entity;
    } catch (error) {
      return ctx.throw(400, "No se pudo completar el pago, intentalo de nuevo");
    }
  },
};
