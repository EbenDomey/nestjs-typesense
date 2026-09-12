import { type DynamicModule, Global, Module, type Provider, type Type } from "@nestjs/common";
import { TypesenseClient } from "./client/typesense.client.js";
import { TypesenseCollections } from "./collections/typesense-collections.js";
import { TypesenseIndexer } from "./collectors/typesense-indexer.js";
import { TypesenseHealthIndicator } from "./health/typesense.health.js";
import { TYPESENSE_MODULE_OPTIONS } from "./typesense.constants.js";
import type { TypesenseModuleOptions } from "./typesense.module-options.js";

export interface TypesenseModuleAsyncOptions {
  imports?: DynamicModule["imports"];
  inject?: (string | symbol | Type<unknown>)[];
  useFactory: (...args: never[]) => Promise<TypesenseModuleOptions> | TypesenseModuleOptions;
}

const EXPORTS = [TypesenseClient, TypesenseCollections, TypesenseIndexer, TypesenseHealthIndicator];

@Global()
@Module({})
export class TypesenseModule {
  static forRoot(options: TypesenseModuleOptions): DynamicModule {
    return TypesenseModule.build({ provide: TYPESENSE_MODULE_OPTIONS, useValue: options });
  }

  static forRootAsync(options: TypesenseModuleAsyncOptions): DynamicModule {
    return TypesenseModule.build(
      {
        provide: TYPESENSE_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      options.imports,
    );
  }

  private static build(
    optionsProvider: Provider,
    imports?: DynamicModule["imports"],
  ): DynamicModule {
    return {
      module: TypesenseModule,
      imports: imports ?? [],
      providers: [optionsProvider, ...EXPORTS],
      exports: EXPORTS,
    };
  }
}
