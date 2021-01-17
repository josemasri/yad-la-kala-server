"use strict";

/**
 * Read the documentation (https://strapi.io/documentation/v3.x/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

module.exports = {
  /**
   * Retrieve a record.
   *
   * @return {Object}
   */

  async findOne(ctx) {
    const { id } = ctx.params;

    const entity = await strapi.services.rifa.findOne({ id });
    // Obtener numeros disponibles para la rifa
    const boletosCompradosRes = await strapi.services.boleto.find({
      rifa: id,
      _limit: -1
    });
    const boletosComprados = boletosCompradosRes
      .map((boleto) => boleto.numero)
      .sort((a, b) => a - b);
    return { ...entity, boletosComprados };
  },
  async getBoletosComprados(ctx) {
    const rifas = await strapi.services.rifa.find({
      _limit: -1,
    });
    const boletos = {};
    for (let i = 0; i < rifas.length; i++) {
      const boletosCompradosRes = await strapi.services.boleto.find({
        rifa: rifas[i].id,
        _limit: -1
      });
      rifas[i].boletosComprados = boletosCompradosRes
        .map((boleto) => boleto.numero)
        .sort((a, b) => a - b);
      boletos[rifas[i].id] = rifas[i].boletosComprados;
    }
    // Obtener numeros disponibles para la rifa
    return boletos;
  },
};
