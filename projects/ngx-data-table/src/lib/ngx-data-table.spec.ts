import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgxDataTable } from './ngx-data-table';

describe('NgxDataTable', () => {
  let component: NgxDataTable;
  let fixture: ComponentFixture<NgxDataTable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgxDataTable],
    }).compileComponents();

    fixture = TestBed.createComponent(NgxDataTable);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
